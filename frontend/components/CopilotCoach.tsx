'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useApiClient } from '@/lib/useApiClient'
import { AIOrb } from './ui/AIOrb'
import ReactMarkdown from 'react-markdown'
import { 
  MessageSquare, Plus, Trash2, Copy, Check, Paperclip, Send, 
  Sparkles, PanelLeftClose, PanelLeft, Search, X, Loader2, Bot, User, ArrowUpRight
} from 'lucide-react'

class ChatErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
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
  
  // Persist active thread in localStorage to ensure chat never disappears on navigation
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && !jobId) {
      return localStorage.getItem('jobcopilot_active_thread_id') || null
    }
    return null
  })

  const [input, setInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!inline)
  const [threadSearch, setThreadSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch threads
  const { data: threads, isLoading: isLoadingThreads } = useQuery<ChatThread[]>({
    queryKey: ['chat_threads'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/chat/threads')
      if (!res.ok) throw new Error('Failed to fetch threads')
      return res.json()
    }
  })

  // Synchronize and auto-select thread on initial load or navigation
  useEffect(() => {
    if (!threads || threads.length === 0) return

    // Contextual: If opened inside a specific job card, pick that job's thread
    if (jobId) {
      const jobThread = threads.find(t => t.job_id === jobId)
      if (jobThread && currentThreadId !== jobThread.id) {
        setCurrentThreadId(jobThread.id)
      }
      return
    }

    // Standalone Coach Page: Maintain or auto-restore last active thread
    if (!currentThreadId || currentThreadId === 'new') {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('jobcopilot_active_thread_id') : null
      const matched = savedId ? threads.find(t => t.id === savedId) : null
      if (matched) {
        setCurrentThreadId(matched.id)
      } else if (currentThreadId !== 'new') {
        setCurrentThreadId(threads[0].id)
      }
    }
  }, [threads, jobId, currentThreadId])

  // Save currentThreadId to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && currentThreadId && currentThreadId !== 'new' && !jobId) {
      localStorage.setItem('jobcopilot_active_thread_id', currentThreadId)
    }
  }, [currentThreadId, jobId])

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
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<{file: File, url: string}[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const newPreviews: {file: File, url: string}[] = []
    attachedFiles.forEach(f => {
      if (f.type.startsWith('image/')) {
        newPreviews.push({ file: f, url: URL.createObjectURL(f) })
      }
    })
    setFilePreviews(newPreviews)
    
    return () => {
      newPreviews.forEach(p => URL.revokeObjectURL(p.url))
    }
  }, [attachedFiles])

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

  const deleteThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const res = await apiFetch(`/api/chat/threads/${threadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete thread')
      return threadId
    },
    onSuccess: (deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['chat_threads'] })
      if (currentThreadId === deletedId) {
        const remaining = (threads || []).filter(t => t.id !== deletedId)
        if (remaining.length > 0) {
          setCurrentThreadId(remaining[0].id)
        } else {
          setCurrentThreadId('new')
        }
      }
    }
  })

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      setErrorMessage(null)
      setIsStreaming(true)

      let tid = currentThreadId
      if (!tid || tid === 'new') {
        const newThread = await createThreadMutation.mutateAsync(
          jobId ? 'Job Context Conversation' : content.slice(0, 32) + (content.length > 32 ? '...' : '')
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
      if (attachedFiles.length > 0) {
        attachedFiles.forEach(f => formData.append('files', f))
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
                  if (now - lastUpdateTime > 40) {
                    setOptimisticMessages(prev => {
                      if (prev.length < 2) return prev
                      const next = [...prev]
                      next[1] = { ...next[1], content: fullResponse }
                      return next
                    })
                    lastUpdateTime = now
                  }
                }
              } catch {}
            }
          }
        }

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
      setAttachedFiles([])
    },
    onError: (err: any, sentContent: string) => {
      setIsStreaming(false)
      setOptimisticMessages([])
      setInput(sentContent)
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
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.items) {
      const newFiles: File[] = []
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) newFiles.push(file)
        }
      }
      if (newFiles.length > 0) {
        setAttachedFiles(prev => [...prev, ...newFiles])
        e.preventDefault()
      }
    }
  }

  const handleCopyCode = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const activeThread = useMemo(() => {
    return threads?.find(t => t.id === currentThreadId)
  }, [threads, currentThreadId])

  const filteredThreads = useMemo(() => {
    if (!threads) return []
    if (!threadSearch.trim()) return threads
    const q = threadSearch.toLowerCase()
    return threads.filter(t => (t.title || '').toLowerCase().includes(q))
  }, [threads, threadSearch])

  return (
    <div className={`flex w-full ${inline ? 'h-[620px] rounded-2xl' : 'h-[calc(100vh-100px)] rounded-3xl'} bg-zinc-950 border border-zinc-800/80 shadow-2xl overflow-hidden font-sans`}>
      {/* 1. Left Conversation History Sidebar (Desktop & Mobile Drawer) */}
      {!inline && (
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="h-full bg-zinc-900/60 border-r border-zinc-800/80 flex flex-col shrink-0 overflow-hidden backdrop-blur-xl"
            >
              {/* Sidebar Header */}
              <div className="p-3.5 border-b border-zinc-800/60 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setCurrentThreadId('new')
                    setOptimisticMessages([])
                    setErrorMessage(null)
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Conversation</span>
                </button>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800/60 transition-colors"
                  title="Collapse Sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              {/* Thread Search */}
              <div className="px-3 pt-2 pb-1">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full bg-zinc-950/80 border border-zinc-800/80 text-zinc-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                  {threadSearch && (
                    <button onClick={() => setThreadSearch('')} className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Thread List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {isLoadingThreads ? (
                  <div className="flex items-center justify-center py-10 text-zinc-500 text-xs gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading chats...
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <div className="text-center py-10 px-4 text-xs text-zinc-500">
                    No conversations found.
                  </div>
                ) : (
                  filteredThreads.map((t) => {
                    const isActive = t.id === currentThreadId
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setCurrentThreadId(t.id)
                          setOptimisticMessages([])
                        }}
                        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                          isActive
                            ? 'bg-zinc-800/90 text-white font-semibold border border-zinc-700/80 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                          <span className="truncate">{t.title || 'Untitled Conversation'}</span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete this conversation thread?')) {
                              deleteThreadMutation.mutate(t.id)
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                          title="Delete Thread"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* 2. Main Chat Workstation */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-zinc-950">
        {/* Workspace Top Bar */}
        <div className="px-5 py-3.5 bg-zinc-900/50 border-b border-zinc-800/80 flex items-center justify-between backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!inline && !sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
                title="Expand Conversations"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Bot className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white text-sm truncate tracking-tight">
                  {activeThread?.title || (currentThreadId === 'new' ? 'New Conversation' : 'Copilot Mentor')}
                </h2>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Staff Mentor
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate">System Design • Live Coding Prep • Tailored Interview Coaching</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCurrentThreadId('new')
                setOptimisticMessages([])
                setErrorMessage(null)
              }}
              className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg transition-all font-semibold flex items-center gap-1.5 hover:bg-zinc-800 active:scale-95"
            >
              <Plus className="w-3 h-3 text-indigo-400" />
              <span>New Chat</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-red-950/70 border-b border-red-800/80 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white px-1">
              ✕
            </button>
          </div>
        )}

        {/* Message Canvas */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
          {/* Welcome Screen when starting fresh */}
          {(!currentThreadId || currentThreadId === 'new') && (!messages || messages.length === 0) && optimisticMessages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-5 py-8 max-w-xl mx-auto">
              <div className="scale-75 origin-center">
                <AIOrb state="idle" />
              </div>
              
              <div className="text-center space-y-1.5">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {jobId ? 'Contextual Job Mentor' : 'Executive AI Technical Mentor'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Trained on real FAANG & Tier-1 technical interviews. Ask about complex system designs, code refactoring, resume tailoring, or mock behavioral questions.
                </p>
              </div>

              {/* Quick Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-2">
                <button
                  onClick={() => setInput("What are the key technical requirements of this job and where are my biggest skill gaps?")}
                  className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3 rounded-xl text-left transition-all group"
                >
                  <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">🎯 Skill Gap Analysis</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Analyze strengths & missing skills</p>
                </button>

                <button
                  onClick={() => setInput("Design a scalable distributed rate-limiter supporting 100k req/sec with Redis and Token Bucket.")}
                  className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3 rounded-xl text-left transition-all group"
                >
                  <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">🏗️ System Design Deep-Dive</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">High-throughput architectures</p>
                </button>

                <button
                  onClick={() => setInput("Give me a mock technical coding problem on concurrency or tree traversals with solution breakdown.")}
                  className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3 rounded-xl text-left transition-all group"
                >
                  <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">💻 Mock Coding Challenge</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Real interview algorithms & tests</p>
                </button>

                <button
                  onClick={() => setInput("Review my resume summary against Senior Backend / AI Engineer expectations.")}
                  className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3 rounded-xl text-left transition-all group"
                >
                  <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">📄 Resume Audit</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Tailor bullets to recruiter standards</p>
                </button>
              </div>
            </div>
          )}

          {currentThreadId && currentThreadId !== 'new' && isLoadingMessages && (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500 space-y-3">
              <AIOrb state="thinking" />
              <p className="text-xs font-medium">Loading chat history...</p>
            </div>
          )}

          {/* Messages Feed */}
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
              <div key={msg.id || idx} className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${
                  isUser 
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200' 
                    : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400'
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className={`max-w-[88%] md:max-w-[80%] rounded-2xl p-4 shadow-sm ${
                  isUser 
                    ? 'bg-indigo-600 text-white rounded-tr-xs' 
                    : 'bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-tl-xs'
                }`}>
                  {isStreamingMsg && !msg.content ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-indigo-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing answer...</span>
                    </div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed text-[13px]">
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
                                      {copiedIndex === codeId ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" />
                                          <span className="text-emerald-400">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  <pre className="p-3.5 overflow-x-auto text-zinc-200 leading-normal">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                </div>
                              ) : (
                                <code className="bg-zinc-800 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
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
                        <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-1 align-middle" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-zinc-900/60 border-t border-zinc-800/80 flex flex-col gap-2 shrink-0">
          {/* Attachment Preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 py-1.5 bg-zinc-950/60 border border-zinc-800 rounded-xl">
              {attachedFiles.map((f, i) => {
                const preview = filePreviews.find(p => p.file === f)?.url
                return (
                  <div key={i} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg">
                    {preview ? (
                      <img src={preview} alt="Attachment" className="w-7 h-7 object-cover rounded border border-zinc-700" />
                    ) : (
                      <Paperclip className="w-4 h-4 text-zinc-400" />
                    )}
                    <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[100px]">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-zinc-500 hover:text-red-400 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,.pdf,.txt,.docx"
              multiple
            />

            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors shrink-0"
              title="Attach File or Screenshot"
            >
              <Paperclip className="w-4 h-4" />
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
                    ? "Ask about this role, requirements, or mock questions..." 
                    : "Ask Copilot Coach anything (Shift+Enter for newline, paste screenshots)..."
                }
                className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl py-3 pl-3.5 pr-12 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-xs md:text-sm placeholder:text-zinc-500 resize-none disabled:opacity-50 max-h-40 leading-relaxed shadow-inner"
              />

              <button
                type="submit"
                disabled={!input.trim() || sendMessageMutation.isPending || isStreaming}
                className="absolute right-2 bottom-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 transition-all shadow-md active:scale-95 flex items-center justify-center"
                title="Send Message"
              >
                {sendMessageMutation.isPending || isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
