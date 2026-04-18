// frontend/src/contexts/JobQueueContext.tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import type { ReactNode } from 'react'
import { getJobStatus } from '../api/client'
import type { JobStatus } from '../api/client'

export type QueuePhase = 'rendering' | 'styling' | 'awaiting' | 'done' | 'error'

export interface QueueEntry {
  jobId: string
  label: string         // e.g. "Cordless drill · Y axis"
  submittedAt: number
  phase: QueuePhase
  status: JobStatus | null
  aiStyled: boolean
  pinnedToCurrent: boolean   // true = the job currently front-and-centre in the studio
}

interface JobQueueApi {
  entries: QueueEntry[]
  activeCount: number
  enqueue: (jobId: string, label: string, opts?: { pinnedToCurrent?: boolean }) => void
  pin: (jobId: string) => void
  unpin: (jobId: string) => void
  remove: (jobId: string) => void
  clearCompleted: () => void
}

const JobQueueContext = createContext<JobQueueApi | null>(null)

/**
 * Immutable helpers — rebuild the list instead of mutating it.
 */
function replaceEntry(list: QueueEntry[], jobId: string, patch: Partial<QueueEntry>): QueueEntry[] {
  return list.map(e => (e.jobId === jobId ? { ...e, ...patch } : e))
}

function phaseFromStatus(s: JobStatus): QueuePhase {
  if (s.status === 'done') return 'done'
  if (s.status === 'error') return 'error'
  if (s.status === 'awaiting_approval') return 'awaiting'
  if (s.current_phase >= 4) return 'styling'
  return 'rendering'
}

export function JobQueueProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const entriesRef = useRef<QueueEntry[]>(entries)
  entriesRef.current = entries

  const enqueue = useCallback((
    jobId: string,
    label: string,
    opts?: { pinnedToCurrent?: boolean },
  ) => {
    setEntries(prev => {
      if (prev.some(e => e.jobId === jobId)) return prev
      const next: QueueEntry = {
        jobId,
        label,
        submittedAt: Date.now(),
        phase: 'rendering',
        status: null,
        aiStyled: false,
        pinnedToCurrent: opts?.pinnedToCurrent ?? false,
      }
      return [next, ...prev]
    })
  }, [])

  const pin = useCallback((jobId: string) => {
    setEntries(prev => prev.map(e => ({ ...e, pinnedToCurrent: e.jobId === jobId })))
  }, [])

  const unpin = useCallback((jobId: string) => {
    setEntries(prev => replaceEntry(prev, jobId, { pinnedToCurrent: false }))
  }, [])

  const remove = useCallback((jobId: string) => {
    setEntries(prev => prev.filter(e => e.jobId !== jobId))
  }, [])

  const clearCompleted = useCallback(() => {
    setEntries(prev => prev.filter(e => e.phase !== 'done' && e.phase !== 'error'))
  }, [])

  // Poll every active (non-terminal) job.
  useEffect(() => {
    const interval = setInterval(async () => {
      const active = entriesRef.current.filter(
        e => e.phase !== 'done' && e.phase !== 'error',
      )
      if (active.length === 0) return
      const results = await Promise.allSettled(
        active.map(e => getJobStatus(e.jobId).then(s => ({ jobId: e.jobId, s }))),
      )
      setEntries(prev => {
        let next = prev
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          const { jobId, s } = r.value
          const phase = phaseFromStatus(s)
          next = replaceEntry(next, jobId, {
            status: s, phase, aiStyled: s.ai_styled,
          })
        }
        return next
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const value = useMemo<JobQueueApi>(() => ({
    entries,
    activeCount: entries.filter(e => e.phase === 'rendering' || e.phase === 'styling').length,
    enqueue, pin, unpin, remove, clearCompleted,
  }), [entries, enqueue, pin, unpin, remove, clearCompleted])

  return <JobQueueContext.Provider value={value}>{children}</JobQueueContext.Provider>
}

export function useJobQueue(): JobQueueApi {
  const ctx = useContext(JobQueueContext)
  if (!ctx) throw new Error('useJobQueue must be used inside <JobQueueProvider>')
  return ctx
}
