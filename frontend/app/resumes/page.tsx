'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useApiClient } from '@/lib/useApiClient'

export default function ResumesPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const { data: resumes, isLoading } = useQuery({
    queryKey: ['resumes'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/resumes')
      if (!res.ok) throw new Error('Failed to fetch resumes')
      return res.json()
    }
  })
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData()
      formData.append('file', uploadFile)
      
      const res = await apiFetch('/api/resumes/upload', {
        method: 'POST',
        body: formData,
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Upload failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
      setFile(null)
      setIsUploading(false)
      alert('Resume parsed and uploaded successfully!')
    },
    onError: (err: any) => {
      setIsUploading(false)
      alert(err.message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to delete' }))
        throw new Error(err.detail || 'Failed to delete')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete resume')
    }
  })

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setIsUploading(true)
    uploadMutation.mutate(file)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Your Resumes</h1>
          <p className="text-zinc-400 mt-2">Upload a PDF resume. Our AI will instantly parse your skills to score jobs against them.</p>
        </div>
      </div>

      <div className="bg-zinc-900/40 p-8 rounded-2xl shadow-sm border border-zinc-800/50 backdrop-blur-sm">
        <form onSubmit={handleUpload} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Upload PDF Resume</label>
            <input 
              type="file" 
              accept=".pdf"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <button 
            type="submit" 
            disabled={!file || isUploading}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Parsing...' : 'Upload & Parse'}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Uploaded Resumes</h2>
        {isLoading ? (
          <div className="text-zinc-500">Loading resumes...</div>
        ) : resumes?.length === 0 ? (
          <div className="text-zinc-500 bg-zinc-900/40 p-6 rounded-xl border border-zinc-800/50 text-center">
            No resumes uploaded yet. Upload one to get started!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {resumes?.map((resume: any) => (
              <div key={resume.id} className="bg-zinc-900/40 p-6 rounded-xl shadow-sm border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{resume.title}</h3>
                    <span className="inline-block px-2 py-1 bg-zinc-800 text-xs font-semibold text-zinc-300 rounded uppercase mt-2">
                      {resume.target_type}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      if(confirm('Delete this resume?')) deleteMutation.mutate(resume.id)
                    }}
                    className="text-red-400 hover:text-red-300 text-sm font-semibold"
                  >
                    Delete
                  </button>
                </div>
                
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">AI Extracted Skills</p>
                  <p className="text-zinc-300 text-sm leading-relaxed">{resume.skills_summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
