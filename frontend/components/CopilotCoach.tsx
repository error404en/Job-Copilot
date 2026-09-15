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

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      let tid = currentThreadId
      if (!tid || tid === 'new') {
        const newThread = await createThreadMutation.mutateAsync(
          jobId ? 'Job Context Conversation' : 'General Coaching'
        )
        tid = newThread.id
      }

      const res = await apiFetch(`/api/chat/threads/${tid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      if (!res.ok) throw new Error('Failed to send message')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat_messages', currentThreadId] })
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sendMessageMutation.isPending) return
    sendMessageMutation.mutate(input)
    setInput('')
  }

  return (
    <div className={`flex flex-col ${inline ? 'h-[600px] border border-zinc-800/50 rounded-2xl' : 'h-[calc(100vh-120px)] border border-zinc-800 rounded-2xl'} bg-zinc-950 shadow-2xl overflow-hidden`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/20 p-4 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🧠</div>
          <div>
            <h2 className="font-bold text-white tracking-tight leading-tight">Copilot Coach</h2>
            <p className="text-xs text-zinc-400">Powered by Llama 3.3 70B</p>
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
              <div className="prose prose-invert prose-sm max-w-none">
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
      <div className="p-4 bg-zinc-950 border-t border-zinc-800/50">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sendMessageMutation.isPending}
            placeholder={jobId ? "Ask about this job..." : "Ask Coach anything..."}
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl py-3.5 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMessageMutation.isPending}
            className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-500 transition-colors"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  )
}
