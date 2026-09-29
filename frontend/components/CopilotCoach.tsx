'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useApiClient } from '@/lib/useApiClient'
import { AIOrb } from './ui/AIOrb'
import ReactMarkdown from 'react-markdown'
import { 
  MessageSquare, Plus, Trash2, Edit2, Copy, Check, Paperclip, Send, 
  Square, Sparkles, PanelLeftClose, PanelLeft, Search, X, Loader2, 
  Bot, User, RotateCcw, ChevronDown
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
  
  // Active Thread ID (persisted in localStorage for standalone coach page)
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && !jobId) {
      return localStorage.getItem('jobcopilot_active_thread_id') || null
    }
    return null
  })

  // Input & UI State
  const [input, setInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!inline)
  const [threadSearch, setThreadSearch] = useState('')
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Streaming State & Abort Controller
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scroll Container & Physics
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Attachments State
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<{file: File, url: string}[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Fetch Threads
  const { data: threads, isLoading: isLoadingThreads } = useQuery<ChatThread[]>({
    queryKey: ['chat_threads'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/chat/threads')
      if (!res.ok) throw new Error('Failed to fetch threads')
      return res.json()
    }
  })

  // Synchronize and auto-select thread
  useEffect(() => {
    if (!threads || threads.length === 0) return

    if (jobId) {
      const jobThread = threads.find(t => t.job_id === jobId)
      if (jobThread && currentThreadId !== jobThread.id) {
        setCurrentThreadId(jobThread.id)
      }
      return
    }

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

  // Persist currentThreadId to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && currentThreadId && currentThreadId !== 'new' && !jobId) {
      localStorage.setItem('jobcopilot_active_thread_id', currentThreadId)
    }
  }, [currentThreadId, jobId])

  // 2. Fetch Messages for Current Thread
  const { data: messages, isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ['chat_messages', currentThreadId],
    enabled: !!currentThreadId && currentThreadId !== 'new',
    queryFn: async () => {
      const res = await apiFetch(`/api/chat/threads/${currentThreadId}/messages`)
      if (!res.ok) throw new Error('Failed to fetch messages')
      return res.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes stale time to prevent unnecessary cache flushes
  })

  // Attachment Previews
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

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [input])

  // Track container scroll position to prevent auto-scroll hijacking
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const atBottom = distanceFromBottom < 100
    isAtBottomRef.current = atBottom
    setShowScrollBottom(!atBottom)
  }, [])

  // Auto-scroll logic: instant lock while streaming, smooth on user action
  const scrollToBottom = useCallback((smooth = false) => {
    if (!scrollContainerRef.current) return
    if (smooth) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    } else {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
    isAtBottomRef.current = true
    setShowScrollBottom(false)
  }, [])

  // When new tokens arrive during streaming, keep locked to bottom if user hasn't scrolled up
  useEffect(() => {
    if (isStreaming && isAtBottomRef.current) {
      scrollToBottom(false)
    }
  }, [streamingContent, isStreaming, scrollToBottom])

  // Thread Mutations
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
    onSuccess: (data: ChatThread) => {
      setCurrentThreadId(data.id)
      queryClient.setQueryData<ChatThread[]>(['chat_threads'], (old = []) => [data, ...old.filter(t => t.id !== data.id)])
    }
  })

  const renameThreadMutation = useMutation({
    mutationFn: async ({ threadId, title }: { threadId: string, title: string }) => {
      const res = await apiFetch(`/api/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })
      if (!res.ok) throw new Error('Failed to rename thread')
      return res.json()
    },
    onSuccess: (updated: ChatThread) => {
      queryClient.setQueryData<ChatThread[]>(['chat_threads'], (old = []) =>
        old.map(t => t.id === updated.id ? { ...t, title: updated.title } : t)
      )
      setEditingThreadId(null)
    }
  })

  const deleteThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const res = await apiFetch(`/api/chat/threads/${threadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete thread')
      return threadId
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<ChatThread[]>(['chat_threads'], (old = []) =>
        old.filter(t => t.id !== deletedId)
      )
      queryClient.removeQueries({ queryKey: ['chat_messages', deletedId] })
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

  // Core Send Message Function (with robust SSE buffer and zero-flicker cache update)
  const executeSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim()
    if (!trimmed || isStreaming) return

    setErrorMessage(null)
    setIsStreaming(true)

    // Determine target thread ID
    let targetThreadId = currentThreadId
    if (!targetThreadId || targetThreadId === 'new') {
      const cleanTitle = jobId ? 'Job Context Conversation' : (trimmed.slice(0, 36) + (trimmed.length > 36 ? '...' : ''))
      try {
        const newThread = await createThreadMutation.mutateAsync(cleanTitle)
        targetThreadId = newThread.id
        setCurrentThreadId(targetThreadId)
      } catch (err: any) {
        setIsStreaming(false)
        setErrorMessage(err.message || 'Failed to initialize conversation thread.')
        return
      }
    }

    // Create optimistic user message & empty assistant placeholder
    const userMsgId = `user-${Date.now()}`
    const asstMsgId = `asst-${Date.now()}`
    const timestamp = new Date().toISOString()

    const optimisticUserMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      created_at: timestamp
    }

    const optimisticAsstMsg: ChatMessage = {
      id: asstMsgId,
      role: 'assistant',
      content: '',
      created_at: timestamp
    }

    // Seamlessly update React Query cache directly - messages will NEVER disappear!
    queryClient.setQueryData<ChatMessage[]>(['chat_messages', targetThreadId], (old = []) => [
      ...old,
      optimisticUserMsg,
      optimisticAsstMsg
    ])

    // Set active streaming pointer
    setStreamingMessageId(asstMsgId)
    setStreamingContent('')
    setInput('')
    
    // Clear attachments for next prompt
    const filesToUpload = [...attachedFiles]
    setAttachedFiles([])

    // Scroll smoothly to bottom upon sending
    setTimeout(() => scrollToBottom(true), 50)

    // Build form data
    const formData = new FormData()
    formData.append('content', trimmed)
    if (filesToUpload.length > 0) {
      filesToUpload.forEach(f => formData.append('files', f))
    }

    // Set up AbortController for Stop Generating button
    const controller = new AbortController()
    abortControllerRef.current = controller

    let fullResponse = ''

    try {
      const res = await apiFetch(`/api/chat/threads/${targetThreadId}/messages`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `Server returned ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          sseBuffer += decoder.decode(value, { stream: true })
          const lines = sseBuffer.split('\n')
          // Retain any incomplete line in the buffer
          sseBuffer = lines.pop() || ''

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || !line.startsWith('data: ')) continue
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') break

            try {
              const parsed = JSON.parse(dataStr)
              if (parsed.error) {
                console.error('SSE Stream error:', parsed.error)
                setErrorMessage(parsed.error)
              } else if (parsed.content) {
                fullResponse += parsed.content
                setStreamingContent(fullResponse)
              }
            } catch {
              // Ignore partial JSON parse errors
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User deliberately clicked "Stop Generating"
        console.log('Stream aborted by user')
      } else {
        console.error('Chat send error:', err)
        setErrorMessage(err.message || 'Failed to complete response. Please check your connection.')
      }
    } finally {
      // Finalize the assistant message in the React Query cache
      queryClient.setQueryData<ChatMessage[]>(['chat_messages', targetThreadId], (old = []) => {
        return old.map(m => m.id === asstMsgId ? { ...m, content: fullResponse || m.content } : m)
      })

      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')
      abortControllerRef.current = null

      // Silently sync with server in background without wiping cache
      queryClient.invalidateQueries({
        queryKey: ['chat_messages', targetThreadId],
        refetchType: 'none'
      })
    }
  }

  // Handle Stop Generating button
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  // Handle Regenerate Response
  const handleRegenerate = () => {
    if (isStreaming || !messages || messages.length === 0) return
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      // Remove last assistant message if present
      if (messages[messages.length - 1].role === 'assistant') {
        queryClient.setQueryData<ChatMessage[]>(['chat_messages', currentThreadId], (old = []) => old.slice(0, -1))
      }
      executeSendMessage(lastUserMsg.content)
    }
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (isStreaming) {
      handleStopGenerating()
    } else {
      executeSendMessage(input)
    }
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

  const handleCopyCode = (codeText: string, codeId: string) => {
    navigator.clipboard.writeText(codeText)
    setCopiedCodeId(codeId)
    setTimeout(() => setCopiedCodeId(null), 2000)
  }

  const handleCopyMessage = (content: string, msgId: string) => {
    navigator.clipboard.writeText(content)
    setCopiedMessageId(msgId)
    setTimeout(() => setCopiedMessageId(null), 2000)
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

  // Display messages list: seamlessly blends cached messages with active streaming token output
  const displayMessages = useMemo(() => {
    const list = messages ? [...messages] : []
    if (isStreaming && streamingMessageId) {
      return list.map(m => m.id === streamingMessageId ? { ...m, content: streamingContent } : m)
    }
    return list
  }, [messages, isStreaming, streamingMessageId, streamingContent])

  return (
    <div className={`flex w-full ${inline ? 'h-[640px] rounded-2xl' : 'h-[calc(100vh-100px)] rounded-3xl'} bg-zinc-950 border border-zinc-800/80 shadow-2xl overflow-hidden font-sans`}>
      {/* 1. Left Conversation History Sidebar (Desktop & Mobile Drawer) */}
      {!inline && (
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="h-full bg-zinc-900/70 border-r border-zinc-800/80 flex flex-col shrink-0 overflow-hidden backdrop-blur-xl"
            >
              {/* Sidebar Header */}
              <div className="p-3.5 border-b border-zinc-800/60 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setCurrentThreadId('new')
                    setErrorMessage(null)
                    if (textareaRef.current) textareaRef.current.focus()
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
              <div className="px-3 pt-2.5 pb-1">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Search conversations..."
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
                    {threadSearch ? 'No matching chats found.' : 'No conversations yet.'}
                  </div>
                ) : (
                  filteredThreads.map((t) => {
                    const isActive = t.id === currentThreadId
                    const isEditing = editingThreadId === t.id

                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          if (isEditing) return
                          setCurrentThreadId(t.id)
                          setErrorMessage(null)
                        }}
                        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                          isActive
                            ? 'bg-zinc-800/90 text-white font-semibold border border-zinc-700/80 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                          
                          {isEditing ? (
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (editingTitle.trim()) {
                                  renameThreadMutation.mutate({ threadId: t.id, title: editingTitle.trim() })
                                }
                              }}
                              className="flex items-center gap-1 w-full"
                            >
                              <input
                                autoFocus
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-zinc-950 border border-indigo-500 text-white text-xs rounded px-1.5 py-0.5 w-full focus:outline-none"
                              />
                              <button
                                type="submit"
                                onClick={(e) => e.stopPropagation()}
                                className="text-emerald-400 hover:text-emerald-300 p-0.5"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingThreadId(null)
                                }}
                                className="text-zinc-500 hover:text-zinc-300 p-0.5"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          ) : (
                            <span className="truncate">{t.title || 'Untitled Conversation'}</span>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingThreadId(t.id)
                                setEditingTitle(t.title || '')
                              }}
                              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50 rounded transition-colors"
                              title="Rename Thread"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('Delete this conversation thread?')) {
                                  deleteThreadMutation.mutate(t.id)
                                }
                              }}
                              className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete Thread"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
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
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-zinc-950 relative">
        {/* Workspace Top Bar */}
        <div className="px-5 py-3.5 bg-zinc-900/50 border-b border-zinc-800/80 flex items-center justify-between backdrop-blur-md shrink-0 z-10">
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
                setErrorMessage(null)
                if (textareaRef.current) textareaRef.current.focus()
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
          <div className="bg-red-950/70 border-b border-red-800/80 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white px-1">
              ✕
            </button>
          </div>
        )}

        {/* Message Canvas (ChatGPT & Claude Centered Reading Container) */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 custom-scrollbar"
        >
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Welcome Screen when starting fresh */}
            {(!currentThreadId || currentThreadId === 'new') && displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-zinc-400 space-y-6 py-12 max-w-xl mx-auto">
                <div className="scale-90 origin-center">
                  <AIOrb state="idle" />
                </div>
                
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {jobId ? 'Contextual Job Mentor' : 'What would you like to master today?'}
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                    Trained on real FAANG & Tier-1 technical interviews. Ask about complex system designs, code refactoring, resume tailoring, or live coding prep.
                  </p>
                </div>

                {/* Quick Prompt Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-2">
                  <button
                    onClick={() => executeSendMessage("What are the key technical requirements of this job and where are my biggest skill gaps?")}
                    className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3.5 rounded-2xl text-left transition-all group"
                  >
                    <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">🎯 Skill Gap Analysis</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Analyze strengths & missing skills</p>
                  </button>

                  <button
                    onClick={() => executeSendMessage("Design a scalable distributed rate-limiter supporting 100k req/sec with Redis and Token Bucket.")}
                    className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3.5 rounded-2xl text-left transition-all group"
                  >
                    <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">🏗️ System Design Deep-Dive</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">High-throughput architectures</p>
                  </button>

                  <button
                    onClick={() => executeSendMessage("Give me a challenging technical coding problem on concurrency or graph traversals with clean solution breakdown.")}
                    className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3.5 rounded-2xl text-left transition-all group"
                  >
                    <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">💻 Mock Coding Challenge</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Real interview algorithms & tests</p>
                  </button>

                  <button
                    onClick={() => executeSendMessage("Review my resume summary against Senior Backend / AI Engineer expectations.")}
                    className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 p-3.5 rounded-2xl text-left transition-all group"
                  >
                    <p className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">📄 Resume Audit</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Tailor bullets to recruiter standards</p>
                  </button>
                </div>
              </div>
            )}

            {/* Loading History State */}
            {currentThreadId && currentThreadId !== 'new' && isLoadingMessages && displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center p-16 text-zinc-500 space-y-3">
                <AIOrb state="thinking" />
                <p className="text-xs font-medium">Loading chat history...</p>
              </div>
            )}

            {/* Messages Feed */}
            {displayMessages.map((msg, idx) => {
              const isUser = msg.role === 'user'
              const isCurrentlyStreaming = isStreaming && msg.id === streamingMessageId
              const isLastAssistantMessage = !isUser && idx === displayMessages.length - 1

              return (
                <div key={msg.id || idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}>
                  <div className={`flex items-start gap-3 max-w-[90%] md:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${
                      isUser 
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200' 
                        : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400'
                    }`}>
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Message Bubble */}
                    <div className={`rounded-2xl px-4 py-3.5 shadow-sm text-[13px] leading-relaxed break-words overflow-hidden ${
                      isUser 
                        ? 'bg-indigo-600 text-white rounded-tr-xs' 
                        : 'bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-tl-xs w-full'
                    }`}>
                      {isCurrentlyStreaming && !msg.content ? (
                        <div className="flex items-center gap-2 py-1 text-xs text-indigo-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Synthesizing answer...</span>
                        </div>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ChatErrorBoundary>
                            <ReactMarkdown
                              components={{
                                code({ inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  const rawCode = String(children).replace(/\n$/, '')
                                  const codeId = `${msg.id}-${rawCode.slice(0, 15)}`

                                  return !inline ? (
                                    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 font-mono text-xs not-prose">
                                      <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 text-xs">
                                        <span className="font-semibold text-zinc-300 lowercase">{match ? match[1] : 'code'}</span>
                                        <button 
                                          type="button"
                                          onClick={() => handleCopyCode(rawCode, codeId)}
                                          className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 bg-zinc-800 px-2 py-1 rounded text-[11px]"
                                        >
                                          {copiedCodeId === codeId ? (
                                            <>
                                              <Check className="w-3 h-3 text-emerald-400" />
                                              <span className="text-emerald-400">Copied</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3 h-3" />
                                              <span>Copy code</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                      <pre className="p-3.5 overflow-x-auto text-zinc-200 leading-normal custom-scrollbar">
                                        <code className={className} {...props}>
                                          {children}
                                        </code>
                                      </pre>
                                    </div>
                                  ) : (
                                    <code className="bg-zinc-800/80 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono border border-zinc-700/60" {...props}>
                                      {children}
                                    </code>
                                  )
                                },
                                table({ children }) {
                                  return (
                                    <div className="overflow-x-auto my-3 border border-zinc-800 rounded-xl">
                                      <table className="w-full text-left text-xs border-collapse">
                                        {children}
                                      </table>
                                    </div>
                                  )
                                },
                                th({ children }) {
                                  return (
                                    <th className="bg-zinc-900 border-b border-zinc-800 px-3 py-2 text-zinc-200 font-semibold">
                                      {children}
                                    </th>
                                  )
                                },
                                td({ children }) {
                                  return (
                                    <td className="px-3 py-2 border-b border-zinc-800/60 text-zinc-300">
                                      {children}
                                    </td>
                                  )
                                },
                                blockquote({ children }) {
                                  return (
                                    <blockquote className="border-l-2 border-indigo-500 pl-3.5 py-1 text-zinc-300 bg-indigo-950/20 rounded-r my-2 italic">
                                      {children}
                                    </blockquote>
                                  )
                                }
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </ChatErrorBoundary>
                          {isCurrentlyStreaming && (
                            <span className="inline-block w-2 h-4.5 bg-indigo-400 ml-1 rounded-xs animate-pulse align-middle" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Row Under Message (Copy & Regenerate) */}
                  {!isUser && !isCurrentlyStreaming && msg.content && (
                    <div className="flex items-center gap-2 mt-1.5 ml-11 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopyMessage(msg.content, msg.id)}
                        className="text-zinc-500 hover:text-zinc-300 text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-900 transition-colors"
                        title="Copy message"
                      >
                        {copiedMessageId === msg.id ? (
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

                      {isLastAssistantMessage && !isStreaming && (
                        <button
                          onClick={handleRegenerate}
                          className="text-zinc-500 hover:text-zinc-300 text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-900 transition-colors"
                          title="Regenerate response"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Regenerate</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Floating Scroll to Bottom Button */}
        {showScrollBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-28 right-8 z-20 bg-zinc-900/90 border border-zinc-700/80 text-zinc-200 hover:text-white p-2.5 rounded-full shadow-xl hover:bg-zinc-800 transition-all active:scale-95 flex items-center justify-center backdrop-blur-md"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {/* 3. Claude & ChatGPT Style Centered Floating Input Dock */}
        <div className="w-full max-w-4xl mx-auto px-4 pb-4 shrink-0 z-10">
          <div className="bg-zinc-900/90 border border-zinc-700/60 shadow-2xl rounded-3xl backdrop-blur-xl transition-all focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 p-2.5 flex flex-col gap-2">
            {/* Attachment Preview Chips */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-1 pb-1.5">
                {attachedFiles.map((f, i) => {
                  const preview = filePreviews.find(p => p.file === f)?.url
                  return (
                    <div key={i} className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 px-2.5 py-1.5 rounded-xl shadow-xs">
                      {preview ? (
                        <img src={preview} alt="Attachment" className="w-7 h-7 object-cover rounded-md border border-zinc-700" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                      <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[120px]">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-zinc-500 hover:text-red-400 text-xs px-1"
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*,.pdf,.txt,.docx"
                multiple
              />

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  jobId 
                    ? "Ask about this role, requirements, or mock interview questions..." 
                    : "Message Copilot Coach (Shift+Enter for newline, paste screenshots)..."
                }
                className="w-full bg-transparent text-white px-3 py-1.5 focus:outline-none transition-all text-xs md:text-sm placeholder:text-zinc-500 resize-none max-h-44 leading-relaxed custom-scrollbar"
              />

              {/* Bottom Dock Control Row */}
              <div className="flex items-center justify-between px-2 pt-1">
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
                    title="Attach File or Screenshot"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <span className="text-[11px] text-zinc-500 hidden sm:inline">
                    {jobId ? 'Job Context Active' : 'Staff Mentor AI'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStopGenerating}
                      className="px-3 py-1.5 bg-red-600/90 hover:bg-red-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                      title="Stop Generating"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() && attachedFiles.length === 0}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl disabled:opacity-30 disabled:pointer-events-none transition-all shadow-md active:scale-95 flex items-center justify-center"
                      title="Send Message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Footer Disclaimer */}
          <p className="text-[10px] text-zinc-500 text-center mt-2">
            Copilot Coach can make mistakes. Verify critical technical decisions and application details.
          </p>
        </div>
      </div>
    </div>
  )
}
