'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'
import ReactMarkdown from 'react-markdown'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const createThreadMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiFetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, job_id: jobId })
      })
      if (!res.ok) throw new Error('Failed to create thread')
      return res.json()
    },
    onSuccess: (data) => {
      setCurrentThreadId(data.id)
      queryClient.invalidateQueries({ queryKey: ['chat_threads'] })
    }
  })

  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      let tid = currentThreadId
      if (!tid || tid === 'new') {
        const newThread = await createThreadMutation.mutateAsync(
          jobId ? 'Job Context Conversation' : 'General Coaching'
        )
        tid = newThread.id
      }

      // Optimistically add user message and placeholder for assistant
      const tempUserMsg = { id: Date.now().toString(), role: 'user' as const, content, created_at: new Date().toISOString() }
      const tempAsstMsg = { id: 'streaming', role: 'assistant' as const, content: '', created_at: new Date().toISOString() }
      
      queryClient.setQueryData(['chat_messages', tid], (old: any) => [...(old || []), tempUserMsg, tempAsstMsg])

      const formData = new FormData()
      formData.append('content', content)
      if (attachedFile) {
        formData.append('file', attachedFile)
      }

      const res = await apiFetch(`/api/chat/threads/${tid}/messages`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error('Failed to send message')

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ""

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
                    console.error("Stream error:", parsed.error)
                } else if (parsed.content) {
                  fullResponse += parsed.content
                  // Update the streaming message in the UI instantly
                  queryClient.setQueryData(['chat_messages', tid], (old: any) => {
                    if (!old) return old
                    const newMessages = [...old]
                    const lastMsg = newMessages[newMessages.length - 1]
                    if (lastMsg.id === 'streaming') {
                      lastMsg.content = fullResponse
                    }
                    return newMessages
                  })
                }
              } catch (e) {
                // ignore parse errors for split chunks
              }
            }
          }
        }
      }
      return tid
    },
    onSuccess: (tid) => {
      queryClient.invalidateQueries({ queryKey: ['chat_messages', tid] })
      setAttachedFile(null)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sendMessageMutation.isPending) return
    sendMessageMutation.mutate(input)
    setInput('')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFile(e.target.files[0])
    }
  }

  return (
    <div className={`flex flex-col ${inline ? 'h-[600px] border border-zinc-800/50 rounded-2xl' : 'h-[calc(100vh-120px)] border border-zinc-800 rounded-2xl'} bg-zinc-950 shadow-2xl overflow-hidden`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/20 p-4 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🧠</div>
          <div>
            <h2 className="font-bold text-white tracking-tight leading-tight">Copilot Coach</h2>
            <p className="text-xs text-zinc-400">Powered by Llama 3.3 70B & Gemini Vision</p>
          </div>
        </div>
        {!inline && (
          <button 
            onClick={() => setCurrentThreadId('new')}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            + New Chat
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {(!currentThreadId || currentThreadId === 'new') && !inline && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
            <div className="text-5xl opacity-50">🤖</div>
            <p className="text-sm font-medium">Ask me about your career, interview prep, or specific jobs.</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md mt-4">
              <button onClick={() => { setInput("How can I improve my resume for Senior Backend roles?"); setCurrentThreadId('new') }} className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl text-xs hover:bg-zinc-800 transition-colors">Improve Resume</button>
              <button onClick={() => { setInput("What are common system design interview questions?"); setCurrentThreadId('new') }} className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl text-xs hover:bg-zinc-800 transition-colors">Interview Prep</button>
            </div>
          </div>
        )}

        {currentThreadId && currentThreadId !== 'new' && isLoadingMessages && (
          <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>
        )}

        {messages?.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-900/80 border border-zinc-800 text-zinc-200'}`}>
              <div className="prose prose-invert prose-sm max-w-none break-words">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        
        {sendMessageMutation.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl p-4 bg-zinc-900/80 border border-zinc-800 text-zinc-200 flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-zinc-950 border-t border-zinc-800/50 flex flex-col gap-2">
        {attachedFile && (
          <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-zinc-300 overflow-hidden">
              <span>📎</span>
              <span className="truncate">{attachedFile.name}</span>
            </div>
            <button type="button" onClick={() => setAttachedFile(null)} className="text-zinc-500 hover:text-red-400">✕</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative flex items-center">
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
            className="absolute left-2 p-2 text-zinc-500 hover:text-zinc-300 transition-colors z-10"
            title="Attach File"
          >
            📎
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sendMessageMutation.isPending}
            placeholder={jobId ? "Ask about this job..." : "Ask Coach anything..."}
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl py-3.5 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMessageMutation.isPending}
            className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-500 transition-colors z-10"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  )
}
