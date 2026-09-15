'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'
import ReactMarkdown from 'react-markdown'

class ChatErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Chat Markdown Rendering Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div className="text-red-400 text-xs p-2 border border-red-900 bg-red-950/20 rounded">Failed to render this message.</div>;
    }
    return this.props.children;
  }
}

interface CopilotCoachProps {
  jobId?: string
  inline?: boolean
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

interface ChatThread {
  id: string
  title: string
  job_id?: string
  created_at: string
}

export default function CopilotCoach({ jobId, inline = false }: CopilotCoachProps) {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const queryClient = useQueryClient()
  
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch threads
  const { data: threads } = useQuery<ChatThread[]>({
    queryKey: ['chat_threads'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/chat/threads')
      if (!res.ok) throw new Error('Failed to fetch threads')
      return res.json()
    }
  })

  // Select a thread matching this jobId if available
  useEffect(() => {
    if (threads && threads.length > 0 && jobId && !currentThreadId) {
      const existing = threads.find(t => t.job_id === jobId)
      if (existing) setCurrentThreadId(existing.id)
    }
  }, [threads, jobId, currentThreadId])

  // Fetch messages for current thread
  const { data: messages, isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ['chat_messages', currentThreadId],
    enabled: !!currentThreadId && currentThreadId !== 'new',
    queryFn: async () => {
      const res = await apiFetch(`/api/chat/threads/${currentThreadId}/messages`)
      if (!res.ok) throw new Error('Failed to fetch messages')
      return res.json()
    }
  })

  // Attached files and image preview
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (attachedFile && attachedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(attachedFile)
      setFilePreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setFilePreview(null)
    }
  }, [attachedFile])

  // Optimistic messages for instant responsiveness and SSE streaming
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // Auto-scroll on new messages or incoming stream tokens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, optimisticMessages, isStreaming])

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const createThreadMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiFetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, job_id: jobId })
      })
      if (!res.ok) {
        let errMsg = `Failed to create thread (${res.status})`
        try {
          const errData = await res.json()
          if (errData.detail) errMsg = errData.detail
        } catch {}
        throw new Error(errMsg)
      }
      return res.json()
    },
    onSuccess: (data) => {
      setCurrentThreadId(data.id)
      queryClient.invalidateQueries({ queryKey: ['chat_threads'] })
    }
  })

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      setErrorMessage(null)
      setIsStreaming(true)

      let tid = currentThreadId
      if (!tid || tid === 'new') {
        const newThread = await createThreadMutation.mutateAsync(
          jobId ? 'Job Context Conversation' : content.slice(0, 35) + (content.length > 35 ? '...' : '')
        )
        tid = newThread.id
      }

      const tempUserMsg: ChatMessage = { 
        id: `user-${Date.now()}`, 
        role: 'user', 
        content, 
        created_at: new Date().toISOString() 
      }
      const tempAsstMsg: ChatMessage = { 
        id: 'streaming-asst', 
        role: 'assistant', 
        content: '', 
        created_at: new Date().toISOString() 
      }
      
      setOptimisticMessages([tempUserMsg, tempAsstMsg])

      const formData = new FormData()
      formData.append('content', content)
      if (attachedFile) {
        formData.append('file', attachedFile)
      }

      const res = await apiFetch(`/api/chat/threads/${tid}/messages`, {
        method: 'POST',
        body: formData
      })
      
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `Server returned ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ''
      let lastUpdateTime = Date.now()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunkStr = decoder.decode(value, { stream: true })
          const lines = chunkStr.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim()
              if (dataStr === '[DONE]') break
              
              try {
                const parsed = JSON.parse(dataStr)
                if (parsed.error) {
                  console.error('SSE Stream error:', parsed.error)
                  setErrorMessage(parsed.error)
                } else if (parsed.content) {
                  fullResponse += parsed.content
                  const now = Date.now()
                  // Throttle state updates to ~50ms to prevent render freezing
                  if (now - lastUpdateTime > 50) {
                    setOptimisticMessages(prev => {
                      if (prev.length < 2) return prev
                      const next = [...prev]
                      next[1] = { ...next[1], content: fullResponse }
                      return next
                    })
                    lastUpdateTime = now
                  }
                }
              } catch (e) {
                // Ignore chunk boundary json parse errors
              }
            }
          }
        }
        
        // Final state update when stream is completely done
        setOptimisticMessages(prev => {
          if (prev.length < 2) return prev
          const next = [...prev]
          next[1] = { ...next[1], content: fullResponse }
          return next
        })
      }
      return tid
    },
    onSuccess: async (tid) => {
      setIsStreaming(false)
      await queryClient.invalidateQueries({ queryKey: ['chat_messages', tid] })
      setOptimisticMessages([])
      setAttachedFile(null)
    },
    onError: (err: any, sentContent: string) => {
      setIsStreaming(false)
      setOptimisticMessages([])
      setInput(sentContent) // Restore user text so it is never eaten!
      setErrorMessage(err?.message || 'Failed to send message. Please try again.')
    }
  })

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || sendMessageMutation.isPending || isStreaming) return
    sendMessageMutation.mutate(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFile(e.target.files[0])
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.items) {
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setAttachedFile(file)
            e.preventDefault()
            return
          }
        }
      }
    }
  }

  const handleCopyCode = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className={`flex flex-col ${inline ? 'h-[600px] border border-zinc-800/80 rounded-2xl' : 'h-[calc(100vh-120px)] border border-zinc-800 rounded-2xl'} bg-zinc-950 shadow-2xl overflow-hidden font-sans`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-950/50 via-zinc-900/60 to-indigo-950/40 px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-lg shadow-lg shadow-blue-500/20">
            🧠
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white tracking-tight leading-tight text-sm">Copilot Coach</h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Senior Staff AI
              </span>
            </div>
            <p className="text-xs text-zinc-400">Deep Technical Mentorship & Interview Prep</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {threads && threads.length > 1 && !inline && (
            <select
              value={currentThreadId || ''}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setCurrentThreadId('new')
                } else {
                  setCurrentThreadId(e.target.value)
                }
                setOptimisticMessages([])
              }}
              className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-zinc-600 max-w-[160px] truncate"
            >
              <option value="new">+ New Chat</option>
              {threads.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title || 'Conversation'}
                </option>
              ))}
            </select>
          )}

          {!inline && (
            <button 
              onClick={() => {
                setCurrentThreadId('new')
                setOptimisticMessages([])
                setErrorMessage(null)
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-all font-medium border border-zinc-700/60 shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <span>+</span>
              <span>New Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Alert if any */}
      {errorMessage && (
        <div className="bg-red-950/60 border-b border-red-800/60 px-4 py-2 text-xs text-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button 
            onClick={() => setErrorMessage(null)} 
            className="text-red-400 hover:text-white px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
        {(!currentThreadId || currentThreadId === 'new') && (!messages || messages.length === 0) && optimisticMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-3xl shadow-inner">
              ⚡
            </div>
            <div className="text-center max-w-md">
              <p className="text-base font-medium text-zinc-200">
                {jobId ? "Contextual Job Role Coach" : "Ask me anything technical or career-oriented"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                From deep system design, coding problems, and resume tailoring to behavioral interview frameworks.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center max-w-lg mt-3">
              {jobId ? (
                <>
                  <button 
                    onClick={() => { setInput("What are the key technical requirements of this job and where are my biggest skill gaps?"); }} 
                    className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 px-3.5 py-2 rounded-xl text-xs text-zinc-300 hover:text-white transition-all text-left"
                  >
                    🎯 Analyze skill gaps for this role
                  </button>
                  <button 
                    onClick={() => { setInput("Draft 3 high-impact talking points tailored to this job based on my past projects."); }} 
                    className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 px-3.5 py-2 rounded-xl text-xs text-zinc-300 hover:text-white transition-all text-left"
                  >
                    💼 Draft tailored interview talking points
                  </button>
                  <button 
                    onClick={() => { setInput("Generate 5 technical interview questions they are most likely to ask for this position."); }} 
                    className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 px-3.5 py-2 rounded-xl text-xs text-zinc-300 hover:text-white transition-all text-left"
                  >
                    ❓ Top 5 predicted technical questions
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => { setInput("Review my resume portfolio against Senior Backend / AI Engineer expectations."); }} 
                    className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 px-3.5 py-2 rounded-xl text-xs text-zinc-300 hover:text-white transition-all text-left"
                  >
                    📄 Review my resume profile
                  </button>
                  <button 
                    onClick={() => { setInput("Design a scalable distributed rate-limiter supporting 100k req/sec with Redis and Token Bucket."); }} 
                    className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 px-3.5 py-2 rounded-xl text-xs text-zinc-300 hover:text-white transition-all text-left"
                  >
                    🏗️ System Design: Distributed Rate Limiter
                  </button>
                  <button 
                    onClick={() => { setInput("Give me a mock technical coding question on concurrency or graph algorithms."); }} 
                    className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 px-3.5 py-2 rounded-xl text-xs text-zinc-300 hover:text-white transition-all text-left"
                  >
                    💻 Mock Coding Challenge
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {currentThreadId && currentThreadId !== 'new' && isLoadingMessages && (
          <div className="flex justify-center p-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Message Thread List */}
        {(() => {
          const displayMessages = [...(messages || [])]
          if (optimisticMessages.length === 2) {
            const dbHasUserMsg = displayMessages.length > 0 && 
                                 displayMessages[displayMessages.length - 1].role === 'user' && 
                                 displayMessages[displayMessages.length - 1].content === optimisticMessages[0].content
            if (!dbHasUserMsg) {
              displayMessages.push(optimisticMessages[0])
            }
            displayMessages.push(optimisticMessages[1])
          }
          return displayMessages
        })().map((msg, idx) => {
          const isUser = msg.role === 'user'
          const isStreamingMsg = msg.id === 'streaming-asst' && isStreaming

          return (
            <div key={msg.id || idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] md:max-w-[80%] rounded-2xl p-4 shadow-md ${
                isUser 
                  ? 'bg-blue-600 text-white rounded-br-xs' 
                  : 'bg-zinc-900/90 border border-zinc-800/90 text-zinc-200 rounded-bl-xs'
              }`}>
                {isStreamingMsg && !msg.content ? (
                  /* Pulsing thinking indicator inside the bubble */
                  <div className="flex items-center gap-1.5 py-1 px-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse [animation-delay:200ms]"></span>
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse [animation-delay:400ms]"></span>
                    <span className="text-xs text-zinc-400 ml-2 font-medium">Thinking...</span>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed">
                    <ChatErrorBoundary>
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '')
                            const rawCode = String(children).replace(/\n$/, '')
                            const codeId = idx * 1000 + Math.floor(Math.random() * 999)

                            return !inline ? (
                              <div className="relative group my-3 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 font-mono text-xs not-prose">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800/80 text-zinc-400 text-xs">
                                  <span className="font-semibold text-zinc-300">{match ? match[1] : 'code'}</span>
                                  <button 
                                    type="button"
                                    onClick={() => handleCopyCode(rawCode, codeId)}
                                    className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded text-[11px]"
                                  >
                                    {copiedIndex === codeId ? '✓ Copied' : 'Copy'}
                                  </button>
                                </div>
                                <pre className="p-3.5 overflow-x-auto text-zinc-200 leading-normal">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              </div>
                            ) : (
                              <code className="bg-zinc-800/80 text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </ChatErrorBoundary>
                    {isStreamingMsg && (
                      <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-1 align-middle" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-zinc-950 border-t border-zinc-800/70 flex flex-col gap-2.5">
        {/* Attachment Card Preview */}
        {attachedFile && (
          <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 px-3 py-2 rounded-xl">
            <div className="flex items-center gap-3 overflow-hidden">
              {filePreview ? (
                <img 
                  src={filePreview} 
                  alt="Attachment preview" 
                  className="w-10 h-10 object-cover rounded-lg border border-zinc-700 shrink-0" 
                />
              ) : (
                <span className="text-xl">📎</span>
              )}
              <div className="truncate">
                <p className="text-xs font-medium text-zinc-200 truncate">{attachedFile.name}</p>
                <p className="text-[10px] text-zinc-500">{(attachedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => {
                setAttachedFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }} 
              className="text-zinc-500 hover:text-red-400 px-2 py-1 text-sm transition-colors"
              title="Remove attachment"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*,.pdf,.txt,.docx"
          />

          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 mb-1 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl transition-colors hover:border-zinc-700 shrink-0"
            title="Attach Image or Document"
          >
            📎
          </button>

          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={sendMessageMutation.isPending || isStreaming}
              placeholder={
                jobId 
                  ? "Ask about this role (Press Enter to send, Shift+Enter for newline, paste screenshots)..." 
                  : "Ask Coach anything (Press Enter to send, Shift+Enter for newline, paste screenshots)..."
              }
              className="w-full bg-zinc-900/90 border border-zinc-800 text-white rounded-xl py-3 pl-3.5 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all text-sm placeholder:text-zinc-500 resize-none disabled:opacity-50 max-h-40 leading-relaxed"
            />

            <button
              type="submit"
              disabled={!input.trim() || sendMessageMutation.isPending || isStreaming}
              className="absolute right-2 bottom-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40 disabled:hover:bg-blue-600 transition-all shadow-md active:scale-95 flex items-center justify-center"
              title="Send Message"
            >
              <svg className="w-4 h-4 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
