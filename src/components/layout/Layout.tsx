import { useEffect, useState } from 'react'
import { useSessionTimeout } from '../../hooks/useSessionTimeout'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { PanelLeftOpen } from 'lucide-react'

// Pages that start with sidebar hidden (full-screen mode)
const FULLSCREEN_ROUTES = ['/pos']

export default function Layout() {
  const location = useLocation()
  const isFullscreenRoute = FULLSCREEN_ROUTES.some(r => location.pathname.startsWith(r))

  // Sidebar hidden by default on POS, visible everywhere else
  const [sidebarOpen, setSidebarOpen] = useState(!isFullscreenRoute)

  // Session timeout — auto-logout on inactivity
  useSessionTimeout()

  // Auto-collapse when navigating to POS, auto-open when leaving
  useEffect(() => {
    if (isFullscreenRoute) {
      setSidebarOpen(false)
    } else {
      setSidebarOpen(true)
    }
  }, [isFullscreenRoute])

  return (
    // Expose toggle to child pages via a CSS custom property trick —
    // we use a data attribute so POSPage can find the button via context
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* ── Sidebar ── smooth slide in/out */}
      <div
        className={`
          flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden
          ${sidebarOpen ? 'w-64' : 'w-0'}
        `}
      >
        {/* Always rendered so it doesn't lose state, just hidden via width */}
        <div className="w-64 h-full">
          <Sidebar />
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

        {/* Floating sidebar toggle button — always visible */}
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className={`
            absolute top-3 left-3 z-30
            w-8 h-8 rounded-lg flex items-center justify-center
            transition-all duration-200 shadow-sm
            ${sidebarOpen
              ? 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
            }
          `}
        >
          <PanelLeftOpen
            className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Page content */}
        <main className="flex-1 overflow-auto px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}