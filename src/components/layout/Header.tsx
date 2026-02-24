import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { Bell } from 'lucide-react'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of your business' },
  '/pos': { title: 'Point of Sale', subtitle: 'Process customer transactions' },
  '/inventory': { title: 'Inventory', subtitle: 'Manage your products & stock' },
  '/customers': { title: 'Customers', subtitle: 'Manage customer accounts' },
  '/suppliers': { title: 'Suppliers', subtitle: 'Manage supplier relationships' },
  '/purchases': { title: 'Purchase Orders', subtitle: 'Track orders from suppliers' },
  '/reports': { title: 'Reports', subtitle: 'Analytics & insights' },
  '/users': { title: 'Users', subtitle: 'Manage staff accounts' },
  '/settings': { title: 'Settings', subtitle: 'Configure your store' },
}

export default function Header() {
  const location = useLocation()
  const { profile } = useAuthStore()
  const page = pageTitles[location.pathname] || { title: 'POS System', subtitle: '' }

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h2 className="text-lg font-bold text-gray-800">{page.title}</h2>
        <p className="text-xs text-gray-400">{page.subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Greeting */}
        <p className="text-sm text-gray-500 hidden md:block">
          {greeting()}, <span className="font-semibold text-gray-700">
            {profile?.full_name?.split(' ')[0]}
          </span> 👋
        </p>

        {/* Notification bell (placeholder) */}
        <button className="relative w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-xl 
          flex items-center justify-center transition-colors">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Date */}
        <div className="hidden lg:block text-right">
          <p className="text-xs font-medium text-gray-700">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-xs text-gray-400">
            {new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </header>
  )
}