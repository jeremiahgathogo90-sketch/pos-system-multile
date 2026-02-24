import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

// Timeout durations in milliseconds
const TIMEOUTS: Record<string, number> = {
  cashier:    60 * 60 * 1000,  // 1 hour
  admin:      60 * 60 * 1000,  // 1 hour
  accountant: 60 * 60 * 1000,  // 1 hour
  owner:      60 * 60 * 1000,  // 1 hour
}

const WARNING_BEFORE_MS = 60 * 1000 // warn 1 minute before logout

// Events that count as "activity"
const ACTIVITY_EVENTS = [
  'mousedown', 'mousemove', 'keydown',
  'touchstart', 'scroll', 'click',
]

export function useSessionTimeout() {
  const { profile, setSession, setProfile } = useAuthStore()
  const navigate = useNavigate()

  const logoutTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningToastId = useRef<string | null>(null)

  const logout = useCallback(async () => {
    // Dismiss warning toast if showing
    if (warningToastId.current) {
      toast.dismiss(warningToastId.current)
      warningToastId.current = null
    }

    // Log the auto-logout event
    if (profile?.id) {
      await supabase.from('audit_log').insert({
        user_id:    profile.id,
        user_name:  profile.full_name,
        user_role:  profile.role,
        action:     'session_timeout',
        meta:       { reason: 'inactivity_timeout' },
        location_id: profile.location_id,
      }).catch(() => {}) // don't block logout if audit fails
    }

    // Clear state
    setSession(null)
    setProfile(null)

    // Navigate first, then sign out in background
    navigate('/login', { replace: true })
    toast.error('Session expired due to inactivity. Please log in again.', {
      duration: 5000,
    })

    supabase.auth.signOut().catch(() => {})
  }, [profile, navigate, setSession, setProfile])


  const resetTimers = useCallback(() => {
    if (!profile?.role) return

    const timeout = TIMEOUTS[profile.role] ?? TIMEOUTS.cashier

    // Clear existing timers
    if (logoutTimer.current)  clearTimeout(logoutTimer.current)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (warningToastId.current) {
      toast.dismiss(warningToastId.current)
      warningToastId.current = null
    }

    // Set warning toast 1 minute before logout
    const warningAt = timeout - WARNING_BEFORE_MS
    if (warningAt > 0) {
      warningTimer.current = setTimeout(() => {
        const minutesLeft = Math.round(WARNING_BEFORE_MS / 60000)
        const id = toast(
          `⚠️ You'll be logged out in ${minutesLeft} minute due to inactivity.`,
          {
            duration: WARNING_BEFORE_MS,
            style: {
              background: '#f59e0b',
              color: '#fff',
              fontWeight: '600',
            },
          }
        )
        warningToastId.current = id
      }, warningAt)
    }

    // Set actual logout timer
    logoutTimer.current = setTimeout(logout, timeout)
  }, [profile?.role, logout])


  useEffect(() => {
    if (!profile?.id) return // not logged in

    // Start timers on mount
    resetTimers()

    // Reset on any user activity
    const handleActivity = () => resetTimers()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))

    return () => {
      // Cleanup on unmount / logout
      if (logoutTimer.current)  clearTimeout(logoutTimer.current)
      if (warningTimer.current) clearTimeout(warningTimer.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
    }
  }, [profile?.id, resetTimers])
}