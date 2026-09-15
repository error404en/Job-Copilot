'use client'

import React from 'react'
import { motion } from 'framer-motion'

interface AIOrbProps {
  state?: 'idle' | 'listening' | 'thinking'
  className?: string
}

export function AIOrb({ state = 'idle', className = '' }: AIOrbProps) {
  // A simple 7x7 circular mask grid
  const grid = Array.from({ length: 49 }, (_, i) => {
    const x = (i % 7) - 3
    const y = Math.floor(i / 7) - 3
    const distance = Math.sqrt(x * x + y * y)
    return { id: i, distance, isVisible: distance <= 3.5 }
  })

  // Animation variants depending on the state
  const getVariants = (distance: number): any => {
    if (state === 'idle') {
      return {
        animate: {
          scale: [0.8, 1, 0.8],
          opacity: [0.4, 0.7, 0.4],
          transition: {
            repeat: Infinity,
            duration: 3 + distance * 0.2,
            ease: 'easeInOut',
          }
        }
      }
    }
    
    if (state === 'thinking') {
      return {
        animate: {
          scale: [0.5, 1.2, 0.5],
          opacity: [0.3, 1, 0.3],
          backgroundColor: ['#ef4444', '#f97316', '#ef4444'], // Red to Orange pulsing
          transition: {
            repeat: Infinity,
            duration: 1.5,
            delay: distance * 0.1,
            ease: 'easeInOut',
          }
        }
      }
    }

    // listening
    return {
      animate: {
        scale: [1, 1.5, 1],
        opacity: [0.6, 1, 0.6],
        transition: {
          repeat: Infinity,
          duration: 1,
          delay: Math.random() * 1,
          ease: 'easeInOut',
        }
      }
    }
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-8 ${className}`}>
      {/* Orb Grid */}
      <div className="grid grid-cols-7 gap-1.5 p-4">
        {grid.map((dot) => (
          <div key={dot.id} className="w-2.5 h-2.5 flex items-center justify-center">
            {dot.isVisible && (
              <motion.div
                className="w-full h-full rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                variants={getVariants(dot.distance)}
                animate="animate"
                initial={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Pill Toggle (Visual only, state controlled by parent usually, but included for preview matching design) */}
      <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800/80 p-1.5 rounded-full backdrop-blur-md">
        <div className="pl-3 pr-2 flex items-center justify-center text-zinc-500">
          <span className="text-[10px]">∷</span>
        </div>
        {['Idle', 'Listening', 'Thinking'].map((s) => (
          <div
            key={s}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
              state.toLowerCase() === s.toLowerCase()
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}
