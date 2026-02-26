import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { useAuthStore } from './store/authStore'

// Layout
import Layout from './components/layout/Layout'

// Pages
import LoginPage       from './pages/auth/LoginPage'
import DashboardPage   from './pages/dashboard/DashboardPage'
import POSPage         from './pages/pos/POSPage'
import MySalesPage     from './pages/mysales/MySalesPage'
import InventoryPage   from './pages/inventory/InventoryPage'
import CustomersPage   from './pages/customers/CustomersPage'
import SuppliersPage   from './pages/suppliers/SuppliersPage'
import PurchasesPage   from './pages/purchases/PurchasesPage'
import ReportsPage     from './pages/reports/ReportsPage'
import UsersPage       from './pages/users/UsersPage'
import SettingsPage    from './pages/settings/SettingsPage'
import AuditLogPage    from './pages/audit/AuditLogPage'
import StorePage       from './pages/store/StorePage'

// ── Protected route wrapper ──────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAuthStore()
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

// ── Full-screen loading spinner ──────────────────────────
function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#1e3a8a] flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white text-sm font-medium tracking-wide">Loading...</p>
    </div>
  )
}

// ── Root App ─────────────────────────────────────────────
export default function App() {
  const { session, setSession, setUser, setProfile, fetchProfile } = useAuthStore()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false

    // ── Failsafe: never stay stuck loading more than 4 seconds ──
    const failsafeTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn('Auth init timeout — forcing ready state')
        setIsInitializing(false)
      }
    }, 4000)

    const initAuth = async () => {
      try {
        // 1. Get current session from Supabase
        const { data: { session: currentSession } } = await supabase.auth.getSession()

        if (cancelled) return

        if (currentSession?.user) {
          setSession(currentSession)
          await fetchProfile(currentSession.user.id)
        } else {
          // No session — clear state and proceed to login
          setSession(null)
          setProfile(null)
        }
      } catch (err) {
        console.error('Auth init error:', err)
      } finally {
        if (!cancelled) {
          clearTimeout(failsafeTimer)
          setIsInitializing(false)
        }
      }
    }

    initAuth()

    // 2. Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (cancelled) return

        setUser(newSession?.user ?? null)
        setSession(newSession)

        if (event === 'SIGNED_IN' && newSession?.user) {
          await fetchProfile(newSession.user.id)
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null)
        }
      }
    )

    return () => {
      cancelled = true
      clearTimeout(failsafeTimer)
      subscription.unsubscribe()
    }
  }, [])

  // Show spinner only during initial auth check
  if (isInitializing) return <LoadingScreen />

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { fontSize: '14px', fontWeight: '500' },
        }}
      />
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />

        {/* Protected — wrapped in Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index               element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"    element={<DashboardPage />} />
          <Route path="pos"          element={<POSPage />} />
          <Route path="my-sales"     element={<MySalesPage />} />
          <Route path="inventory"    element={<InventoryPage />} />
          <Route path="customers"    element={<CustomersPage />} />
          <Route path="suppliers"    element={<SuppliersPage />} />
          <Route path="purchases"    element={<PurchasesPage />} />
          <Route path="reports"      element={<ReportsPage />} />
          <Route path="users"        element={<UsersPage />} />
          <Route path="settings"     element={<SettingsPage />} />
          <Route path="audit"        element={<AuditLogPage />} />
          <Route path="store"        element={<StorePage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}