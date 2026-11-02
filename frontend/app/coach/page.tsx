'use client'

import CopilotCoach from '@/components/CopilotCoach'
import { PageHeader } from '@/components/ui/PageHeader'
import { BrainCircuit } from 'lucide-react'

export default function CoachPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      <PageHeader
        suite="Preparation & Strategy Studio"
        title="AI Career Coach"
        subtitle="Dedicated AI strategist for behavioral mock interviews, technical system design drills, and role-specific hiring questions powered by your Primary Resume and tracked jobs."
        icon={BrainCircuit}
        badge="AI Strategist"
        badgeColor="indigo"
      />
      <CopilotCoach />
    </div>
  )
}
