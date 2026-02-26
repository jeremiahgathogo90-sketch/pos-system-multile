import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

interface AuthState {
  session:   Session | null
  user:      User | null
  profile:   Profile | null
  isLoading: boolean

  setSession:    (session: Session | null) => void
  setUser:       (user: User | null) => void
  setProfile:    (profile: Profile | null) => void
  fetchProfile:  (userId: string) => Promise<void>
  logout:        () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session:   null,
      user:      null,
      profile:   null,
      isLoading: false,   // ← NEVER persisted (see partialize below)

      setSession: (session) =>
        set({ session, user: session?.user ?? null }),

      setUser: (user) =>
        set({ user }),

      setProfile: (profile) =>
        set({ profile }),

      logout: () => {
        set({ session: null, user: null, profile: null, isLoading: false })
      },

      fetchProfile: async (userId: string) => {
        set({ isLoading: true })
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*, location:locations(id, name)')
            .eq('id', userId)
            .single()

          if (error) throw error
          set({ profile: data, isLoading: false })
        } catch (err) {
          console.error('fetchProfile error:', err)
          // Always turn off loading even on failure
          set({ profile: null, isLoading: false })
        }
      },
    }),
    {
      name: 'pos-auth',
      // isLoading is intentionally excluded — it must never be
      // persisted, otherwise a stale true value causes infinite loading
      partialize: (state) => ({
        session: state.session,
        user:    state.user,
        profile: state.profile,
      }),
    }
  )
)