'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  RefreshCcw,
  Bot,
  User,
  ArrowRight,
  MessageSquare,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface ChatThread {
  id: string
  title: string
  created_at: string
}

// Sample conversations for logged-out / demo mode
const DEMO_SESSIONS: Record<string, { title: string; messages: ChatMessage[] }> = {
  northwind: {
    title: 'Northwind: gap plan',
    messages: [
      {
        id: 'nw-1',
        role: 'user',
        content: 'I scored 91 on the Northwind Backend Intern role. What should I fix before applying?',
      },
      {
        id: 'nw-2',
        role: 'assistant',
        content:
          'You are in solid shape. The one gap in the posting is Kubernetes. You do not need to master it this week, but one line in your cover letter about deploying services with Docker will cover most of the concern. Lead with your retrieval project: it directly matches their stack.',
      },
    ],
  },
  quillstone: {
    title: 'Quillstone interview prep',
    messages: [
      {
        id: 'qs-1',
        role: 'user',
        content: 'How should I prepare for Quillstone’s AI Engineer interview?',
      },
      {
        id: 'qs-2',
        role: 'assistant',
        content:
          'Quillstone’s stack leans heavily into vector retrieval, embeddings, and prompt optimization. Be prepared to explain how your RAG pipeline evaluates recall, how you index document chunks, and how you handle token budget limits.',
      },
    ],
  },
  bullets: {
    title: 'Rewrite my project bullets',
    messages: [
      {
        id: 'bl-1',
        role: 'user',
        content: 'Rewrite my project bullets for high-scale backend roles.',
      },
      {
        id: 'bl-2',
        role: 'assistant',
        content:
          'Start with the measurable result, then the engineering method. For example: "Engineered a low-latency RAG pipeline with FastAPI and LangChain, indexing 50k+ technical documents with <200ms vector retrieval." Keep it to two concise lines per project.',
      },
    ],
  },
  negotiating: {
    title: 'Negotiating an internship stipend',
    messages: [
      {
        id: 'ng-1',
        role: 'user',
        content: 'What is the best way to negotiate an internship stipend?',
      },
      {
        id: 'ng-2',
        role: 'assistant',
        content:
          'Anchor on the value you deliver from day one. Mention your ability to ship production Python/FastAPI code without onboarding ramp-up, and reference market bands (₹25k–₹50k/mo) respectfully.',
      },
    ],
  },
}

export default function CareerCoachPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [localDemoMessages, setLocalDemoMessages] = useState<ChatMessage[]>(DEMO_SESSIONS.northwind.messages)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch threads for signed-in user
  const { data: serverThreads, isLoading: isLoadingThreads } = useQuery<ChatThread[]>({
    queryKey: ['chat_threads'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/chat/threads')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Set active thread once threads load
  useEffect(() => {
    if (isSignedIn && serverThreads && serverThreads.length > 0) {
      if (!activeThreadId || activeThreadId.startsWith('demo-') || !serverThreads.some((t) => t.id === activeThreadId)) {
        setActiveThreadId(serverThreads[0].id)
      }
    } else if (!isSignedIn && !activeThreadId) {
      setActiveThreadId('northwind')
    }
  }, [isSignedIn, serverThreads, activeThreadId])

  // Is current active thread a server UUID thread?
  const isServerThread = Boolean(isSignedIn && activeThreadId && activeThreadId.length > 15)

  // Fetch messages for active thread from DB/API
  const { data: serverMessages, refetch: refetchMessages, isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ['chat_messages', activeThreadId],
    enabled: isLoaded && isServerThread,
    queryFn: async () => {
      if (!activeThreadId) return []
      const res = await apiFetch(`/api/chat/threads/${activeThreadId}/messages`)
      if (!res.ok) return []
      return res.json()
    },
  })

  // Create new thread
  const createThreadMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiFetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error('Failed to create thread')
      return res.json()
    },
    onSuccess: (newThread) => {
      queryClient.invalidateQueries({ queryKey: ['chat_threads'] })
      setActiveThreadId(newThread.id)
    },
  })

  // Delete thread
  const deleteThreadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/chat/threads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete thread')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat_threads'] })
      if (serverThreads && serverThreads.length > 1) {
        const remaining = serverThreads.filter((t) => t.id !== activeThreadId)
        setActiveThreadId(remaining[0]?.id || null)
      } else {
        setActiveThreadId(null)
      }
    },
  })

  // Switch demo session
  const selectDemoSession = (key: string) => {
    setActiveThreadId(key)
    if (DEMO_SESSIONS[key]) {
      setLocalDemoMessages(DEMO_SESSIONS[key].messages)
    }
  }

  // Active messages list to render
  const displayMessages = useMemo(() => {
    if (isSignedIn) {
      if (serverMessages && serverMessages.length > 0) {
        return serverMessages
      }
      return []
    }
    // When signed out, use demo messages
    return localDemoMessages
  }, [isSignedIn, serverMessages, localDemoMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  // Preset suggestion chips answers
  const presetAnswers: Record<string, string> = {
    'How should I phrase my project bullets?':
      'Start with the measurable result, then the engineering method. For example: "Engineered a low-latency RAG pipeline with FastAPI and LangChain, indexing 50k+ technical documents with <200ms vector retrieval." Keep it to two concise lines per project.',
    'What will they ask about my RAG project?':
      'Expect deep-dives on how you chunked and indexed documents, how you evaluated retrieval recall, vector similarity thresholds, and what architectural bottlenecks you would encounter at 10x query scale. Prepare one honest debugging story.',
    'How do I close the Kubernetes gap fast?':
      'Two days of focused work is plenty: containerise one of your existing FastAPI services using a multi-stage Dockerfile, write a clean docker-compose config, and add it to your resume as a verified bullet point.',
    'Negotiating an internship stipend':
      'Anchor on the value you deliver from day one. Mention your ability to ship production Python/FastAPI code without onboarding ramp-up, and reference market bands (₹25k–₹50k/mo) respectfully.',
  }

  // Handle Send Message
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isSending) return
    const trimmed = text.trim()
    setIsSending(true)

    // Logged-out demo mode handling
    if (!isSignedIn) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      }
      setLocalDemoMessages((prev) => [...prev, userMsg])
      setInputText('')

      setTimeout(() => {
        const reply =
          presetAnswers[trimmed] ||
          'Focus on quantified impact, clean documentation, and end-to-end service ownership. That is the quickest way to turn a high fit score into an interview callback.'
        setLocalDemoMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: reply,
          },
        ])
        setIsSending(false)
      }, 600)
      return
    }

    // Signed-in server handling
    try {
      let threadId = activeThreadId
      if (!threadId || !isServerThread) {
        const newTh = await createThreadMutation.mutateAsync(trimmed.slice(0, 30))
        threadId = newTh.id
        setActiveThreadId(newTh.id)
      }

      setInputText('')

      // Call streaming backend endpoint with form-data
      const formData = new FormData()
      formData.append('content', trimmed)

      const res = await apiFetch(`/api/chat/threads/${threadId}/messages`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        // Read SSE stream or wait for completion to refetch persisted messages
        try {
          const reader = res.body?.getReader()
          if (reader) {
            while (true) {
              const { done } = await reader.read()
              if (done) break
            }
          }
        } catch {}
        refetchMessages()
        queryClient.invalidateQueries({ queryKey: ['chat_threads'] })
      } else {
        refetchMessages()
      }
    } catch (err) {
      console.error('Send error:', err)
    } finally {
      setIsSending(false)
    }
  }

  const suggestions = [
    'How should I phrase my project bullets?',
    'What will they ask about my RAG project?',
    'How do I close the Kubernetes gap fast?',
    'Negotiating an internship stipend',
  ]

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">
        {/* Header */}
        <header className="flex flex-col gap-2.5">
          <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">/ AI career coach</span>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
            Ask anything <i className="italic text-[#A9A59C]">about a role.</i>
          </h1>
        </header>

        {/* 2-Column Responsive Workspace */}
        <div className="flex flex-col md:flex-row gap-5 items-stretch min-h-[660px]">
          {/* Left Column: Sessions List */}
          <aside aria-label="Sessions" className="w-full md:w-64 shrink-0 flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-3 pb-2 border-b border-white/10">
              <span className="font-mono text-xs uppercase tracking-wider text-[#A8A59D]">Recent sessions</span>
              {isSignedIn ? (
                <button
                  onClick={() => createThreadMutation.mutate('New Conversation')}
                  className="w-6 h-6 rounded-full flex items-center justify-center bg-white/5 border border-white/15 text-[#C9C6BE] hover:text-[#F3EFE7] hover:bg-white/10 transition cursor-pointer"
                  title="New Conversation"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="text-[10px] font-mono text-zinc-500">Sample</span>
              )}
            </div>

            <div className="flex flex-col gap-1 mt-1 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
              {isSignedIn ? (
                serverThreads && serverThreads.length > 0 ? (
                  serverThreads.map((t) => {
                    const isSelected = activeThreadId === t.id
                    return (
                      <div
                        key={t.id}
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-white/[0.08] text-[#FFFFFF] font-medium'
                            : 'text-[#A8A59D] hover:bg-white/[0.04] hover:text-[#F3EFE7]'
                        }`}
                        onClick={() => setActiveThreadId(t.id)}
                      >
                        <span className="truncate flex-1">{t.title}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete session "${t.title}"?`)) {
                              deleteThreadMutation.mutate(t.id)
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition ml-1"
                          title="Delete thread"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })
                ) : (
                  <div className="p-3 text-xs text-zinc-500 text-center">
                    No conversations yet. Ask a question below to start.
                  </div>
                )
              ) : (
                // Signed-out sample sessions
                Object.entries(DEMO_SESSIONS).map(([key, item]) => {
                  const isSelected = activeThreadId === key
                  return (
                    <button
                      key={key}
                      onClick={() => selectDemoSession(key)}
                      className={`sess text-left w-full px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.08] text-[#FFFFFF] font-medium'
                          : 'text-[#A8A59D] hover:bg-white/[0.04] hover:text-[#F3EFE7]'
                      }`}
                    >
                      {item.title}
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          {/* Right Column: Chat Stream & Interactive Workspace */}
          <section
            aria-label="Conversation"
            className="glass flex-1 min-w-0 p-6 sm:p-8 flex flex-col justify-between gap-5 rounded-2xl min-h-[620px]"
          >
            {/* Messages Thread */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
              {displayMessages.length === 0 && !isLoadingMessages && (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#8C97FF]">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-200">Start a coaching session</h3>
                  <p className="text-xs text-zinc-400 max-w-sm">
                    Ask anything about role requirements, interview preparation, resume bullets, or negotiation.
                  </p>
                </div>
              )}

              {isLoadingMessages && displayMessages.length === 0 && (
                <div className="flex items-center justify-center py-16 gap-2 text-xs text-zinc-400">
                  <RefreshCcw className="w-4 h-4 animate-spin text-[#8C97FF]" />
                  <span>Loading conversation history...</span>
                </div>
              )}

              {displayMessages.map((m) => {
                const isUser = m.role === 'user'
                return (
                  <div
                    key={m.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] p-4 rounded-[18px] text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-[#F3EFE7] text-[#0A0A0C] border border-[#F3EFE7] font-medium'
                          : 'bg-white/[0.05] text-[#E4E0D6] border border-white/[0.12]'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                )
              })}

              {isSending && (
                <div className="flex justify-start">
                  <div className="p-4 rounded-[18px] bg-white/[0.05] border border-white/[0.12] text-xs text-[#A8A59D] flex items-center gap-2">
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin text-[#8C97FF]" />
                    <span>Analyzing role requirements and tailoring advice...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.08]">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s)}
                  className="sg text-xs text-[#D8D4CA] hover:text-[#F3EFE7] bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.14] hover:border-white/25 rounded-2xl px-3.5 py-2 transition cursor-pointer text-left"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input Bar (No blue outline box; subtle matching dark border on focus) */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage(inputText)
              }}
              className="flex items-center gap-2.5 rounded-full p-1.5 pl-5 bg-white/[0.06] border border-white/[0.14] focus-within:border-white/35 focus-within:ring-1 focus-within:ring-white/10 transition"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about a role, a gap, or a draft..."
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[#F3EFE7] text-sm placeholder:text-[#8E8C86] focus:outline-none focus:ring-0"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="h-10 px-5 rounded-full bg-[#F3EFE7] hover:bg-white text-[#0A0A0C] font-semibold text-xs tracking-wide transition cursor-pointer shrink-0 disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
