import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function ProtectedRoute() {
  const { user, profile } = useAuthStore()

  if (!user) return <Navigate to="/login" replace />

  // Block inactive users
  if (profile && !profile.is_active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Account Disabled</h2>
          <p className="text-gray-500 text-sm mb-4">
            Your account has been deactivated. Contact your administrator.
          </p>
          <button
            onClick={() => useAuthStore.getState().logout()}
            className="text-sm text-red-500 hover:text-red-600 font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}