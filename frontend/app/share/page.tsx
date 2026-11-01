"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useApiClient } from "@/lib/useApiClient"
import { Loader2 } from "lucide-react"

function ShareTargetInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [status, setStatus] = useState("Initializing...")

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setStatus("Please sign in to save leads.")
      // Might want to redirect to sign-in here, but Clerk middleware handles basic auth redirects 
      // if protected. Since /share isn't protected by default, we just show a message.
      return
    }

    const title = searchParams.get("title") || ""
    const text = searchParams.get("text") || ""
    const url = searchParams.get("url") || ""

    // Build the combined content
    let content = text
    if (url && !text.includes(url)) {
      content += `\n${url}`
    }
    if (title && !content.includes(title)) {
      content = `${title}\n${content}`
    }

    if (!content.trim()) {
      setStatus("No content received to share. Redirecting to Inbox...")
      setTimeout(() => router.push("/inbox"), 2000)
      return
    }

    setStatus("Saving lead to Inbox...")
    apiFetch("/api/inbox/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, source_type: "text" })
    }).then(res => {
      if (res.ok) {
        setStatus("Lead saved successfully! Redirecting...")
      } else {
        setStatus("Failed to save lead.")
      }
      setTimeout(() => router.push("/inbox"), 1500)
    }).catch(err => {
      setStatus("Error saving lead.")
      setTimeout(() => router.push("/inbox"), 2000)
    })
  }, [isLoaded, isSignedIn, searchParams, router, apiFetch])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="bg-zinc-900/60 p-8 rounded-3xl border border-zinc-800 flex flex-col items-center gap-4 text-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-zinc-200 font-medium">{status}</p>
      </div>
    </div>
  )
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div>}>
      <ShareTargetInner />
    </Suspense>
  )
}
