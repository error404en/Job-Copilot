'use client'

import CopilotCoach from '@/components/CopilotCoach'
import { PageHeader } from '@/components/ui/PageHeader'
import { BrainCircuit } from 'lucide-react'

export default function CoachPage() {
  return (
    <div className="w-full max-w-7xl mx-auto py-2 space-y-6 font-sans">
      <PageHeader
        suite="Preparation & Strategy Studio"
        title="AI Interview Coach"
        subtitle="Dedicated AI career strategist for behavioral mock interviews, technical system design drills, and role-specific hiring questions powered by your resume and tracked jobs."
        icon={BrainCircuit}
        badge="AI Powered"
        badgeColor="indigo"
      />
      <CopilotCoach />
    </div>
  )
}
