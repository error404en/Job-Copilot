'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface StatusDatePickerProps {
  date: Date
  status: string
  onDateChange: (date: Date) => void
  onStatusChange: (status: string) => void
}

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
]
const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

const STATUSES = [
  { id: 'saved', label: 'Saved', color: 'bg-zinc-500' },
  { id: 'applied', label: 'Applied', color: 'bg-blue-500' },
  { id: 'interview', label: 'Interview', color: 'bg-yellow-500' },
  { id: 'offer', label: 'Offer', color: 'bg-green-500' },
  { id: 'rejected', label: 'Rejected', color: 'bg-red-500' },
]

export function StatusDatePicker({ date, status, onDateChange, onStatusChange }: StatusDatePickerProps) {
  const [selectedDay, setSelectedDay] = useState(date.getDate())
  const [selectedMonth, setSelectedMonth] = useState(date.getMonth()) // 0-11
  const [selectedYear, setSelectedYear] = useState(date.getFullYear())

  // Refs for scrolling
  const dayRef = useRef<HTMLDivElement>(null)
  const monthRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)

  // Sync state to parent date object when changed
  useEffect(() => {
    const newDate = new Date(selectedYear, selectedMonth, selectedDay)
    // Avoid infinite loop if same date
    if (newDate.getTime() !== date.getTime()) {
      onDateChange(newDate)
    }
  }, [selectedDay, selectedMonth, selectedYear])

  // Simple scroll snap handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>, setter: (val: number) => void, items: any[]) => {
    const el = e.currentTarget
    const itemHeight = 40 // Matches h-10
    const index = Math.round(el.scrollTop / itemHeight)
    if (index >= 0 && index < items.length) {
      // items could be DAYS (1-31) or MONTHS (0-11) or YEARS (2024-2033)
      if (items === DAYS) setter(items[index])
      if (items === MONTHS) setter(index)
      if (items === YEARS) setter(items[index])
    }
  }

  // Initial scroll positioning
  useEffect(() => {
    const itemHeight = 40
    if (dayRef.current) dayRef.current.scrollTop = (selectedDay - 1) * itemHeight
    if (monthRef.current) monthRef.current.scrollTop = selectedMonth * itemHeight
    if (yearRef.current) yearRef.current.scrollTop = YEARS.indexOf(selectedYear) * itemHeight
  }, []) // run once on mount

  // Formatted date string
  const formattedDateString = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(selectedYear, selectedMonth, selectedDay))

  return (
    <div className="flex flex-col items-center bg-zinc-950/50 p-6 rounded-3xl border border-zinc-800/80 shadow-2xl w-full max-w-sm mx-auto backdrop-blur-xl">
      <div className="text-zinc-500 text-xs font-bold tracking-widest uppercase mb-1">
        Date & Status
      </div>
      
      {/* Date Picker Wheels */}
      <div className="relative w-full h-40 bg-zinc-900 rounded-3xl overflow-hidden my-6 border border-zinc-800/80">
        {/* The highlight bar in the middle */}
        <div className="absolute top-1/2 left-0 w-full h-10 -translate-y-1/2 bg-zinc-800/50 pointer-events-none" />
        
        <div className="absolute inset-0 flex justify-between px-4">
          
          {/* Day Wheel */}
          <div 
            ref={dayRef}
            className="w-1/3 h-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
            onScroll={(e) => handleScroll(e, setSelectedDay, DAYS)}
          >
            <div className="h-[60px]" /> {/* Padding top */}
            {DAYS.map((d) => (
              <div key={d} className={`h-10 flex items-center justify-center snap-center text-xl font-medium transition-all ${selectedDay === d ? 'text-white' : 'text-zinc-600'}`}>
                {d}
              </div>
            ))}
            <div className="h-[60px]" /> {/* Padding bottom */}
          </div>

          {/* Month Wheel */}
          <div 
            ref={monthRef}
            className="w-1/3 h-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
            onScroll={(e) => handleScroll(e, setSelectedMonth, MONTHS)}
          >
            <div className="h-[60px]" />
            {MONTHS.map((m, i) => (
              <div key={m} className={`h-10 flex items-center justify-center snap-center text-xl font-medium transition-all ${selectedMonth === i ? 'text-white' : 'text-zinc-600'}`}>
                {m}
              </div>
            ))}
            <div className="h-[60px]" />
          </div>

          {/* Year Wheel */}
          <div 
            ref={yearRef}
            className="w-1/3 h-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
            onScroll={(e) => handleScroll(e, setSelectedYear, YEARS)}
          >
            <div className="h-[60px]" />
            {YEARS.map((y) => (
              <div key={y} className={`h-10 flex items-center justify-center snap-center text-xl font-medium transition-all ${selectedYear === y ? 'text-white' : 'text-zinc-600'}`}>
                {y}
              </div>
            ))}
            <div className="h-[60px]" />
          </div>

        </div>

        {/* Labels at bottom of wheel */}
        <div className="absolute bottom-2 left-0 w-full flex justify-between px-8 pointer-events-none">
          <span className="text-[9px] font-bold text-zinc-500 tracking-wider w-1/3 text-center">DAY</span>
          <span className="text-[9px] font-bold text-zinc-500 tracking-wider w-1/3 text-center">MONTH</span>
          <span className="text-[9px] font-bold text-zinc-500 tracking-wider w-1/3 text-center">YEAR</span>
        </div>
      </div>

      <div className="text-zinc-300 text-sm font-medium mb-6">
        {formattedDateString}
      </div>

      {/* Status Pills */}
      <div className="w-full flex items-center gap-2 p-1.5 bg-zinc-900 rounded-full border border-zinc-800">
        <div className="flex-1 flex overflow-x-auto no-scrollbar gap-1 relative">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => onStatusChange(s.id)}
              className={`relative px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 z-10 ${
                status === s.id ? 'text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {status === s.id && (
                <motion.div 
                  layoutId="activeStatusBg"
                  className="absolute inset-0 bg-white rounded-full -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              {s.label}
            </button>
          ))}
        </div>
        
        {/* Divider */}
        <div className="w-[1px] h-6 bg-zinc-800 mx-1 shrink-0" />

        {/* Status Colored Dots */}
        <div className="flex items-center gap-1.5 px-2 shrink-0">
          {STATUSES.map((s) => (
            <div 
              key={`dot-${s.id}`} 
              className={`w-3 h-3 rounded-full ${s.color} transition-all duration-300 ${status === s.id ? 'scale-125 ring-2 ring-zinc-700 ring-offset-2 ring-offset-zinc-900' : 'opacity-40'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
