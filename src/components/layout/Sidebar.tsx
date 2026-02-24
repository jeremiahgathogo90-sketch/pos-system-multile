import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'
import { supabase } from '../../lib/supabase'
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  ClipboardList, BarChart3, Settings, LogOut, Receipt,
  UserCog, Store, ChevronRight, Shield, Building2, ChevronDown,
  CheckCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const navItems = [
  { label: 'Dashboard',      to: '/dashboard', icon: LayoutDashboard, roles: ['owner','admin','accountant','cashier'] },
  { label: 'Point of Sale',  to: '/pos',       icon: ShoppingCart,    roles: ['owner','admin','cashier']              },
  { label: 'My Sales',       to: '/my-sales',  icon: Receipt,         roles: ['owner','admin','accountant','cashier'] },
  { label: 'Inventory',      to: '/inventory', icon: Package,         roles: ['owner','admin','accountant']           },
  { label: 'Customers',      to: '/customers', icon: Users,           roles: ['owner','admin','accountant','cashier'] },
  { label: 'Suppliers',      to: '/suppliers', icon: Truck,           roles: ['owner','admin','accountant']           },
  { label: 'Purchase Orders',to: '/purchases', icon: ClipboardList,   roles: ['owner','admin','accountant']           },
  { label: 'Reports',        to: '/reports',   icon: BarChart3,       roles: ['owner','admin','accountant']           },
  { label: 'Users',          to: '/users',     icon: UserCog,         roles: ['owner','admin']                        },
  { label: 'Settings',       to: '/settings',  icon: Settings,        roles: ['owner','admin']                        },
  { label: 'Audit Log',       to: '/audit',     icon: Shield,          roles: ['owner','accountant']                   },
]

interface Location { id: string; name: string; is_active: boolean }

export default function Sidebar() {
  const navigate = useNavigate()
  const { profile, logout } = useAuthStore()
  const { selectedBranchId, selectedBranchName, setBranch } = useBranchStore()

  const [locations, setLocations]     = useState<Location[]>([])
  const [showBranchPicker, setShowBranchPicker] = useState(false)

  const userRole   = profile?.role || 'cashier'
  const isCrossBranch = userRole === 'owner' || userRole === 'accountant'
  const visibleItems  = navItems.filter(item => item.roles.includes(userRole))

  useEffect(() => {
    if (isCrossBranch) fetchLocations()
  }, [isCrossBranch])

  const fetchLocations = async () => {
    const { data } = await supabase.from('locations').select('id, name, is_active').order('name')
    setLocations(data || [])
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      logout()
      navigate('/login', { replace: true })
      toast.success('Logged out successfully')
    } catch (err: any) {
      logout()
      navigate('/login', { replace: true })
    }
  }

  const handleSelectBranch = (id: string | null, name: string) => {
    setBranch(id, name)
    setShowBranchPicker(false)
  }

  // Display branch — for non-cross-branch users show their assigned branch
  const displayBranch = isCrossBranch
    ? selectedBranchName
    : (profile?.location?.name || 'My Branch')

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full shrink-0">

      {/* Brand */}
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-white text-base leading-tight truncate">My Shop</p>
            <p className="text-xs text-gray-400 truncate">{displayBranch}</p>
          </div>
        </div>
      </div>

      {/* ── Branch Switcher (owner + accountant only) ── */}
      {isCrossBranch && (
        <div className="px-3 pt-3 pb-1">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5 px-1">Branch</p>
          <div className="relative">
            <button
              onClick={() => setShowBranchPicker(!showBranchPicker)}
              className="w-full flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3 py-2 transition-colors">
              <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="flex-1 text-sm font-semibold text-white truncate text-left">
                {selectedBranchName}
              </span>
              <ChevronDown className={clsx('w-4 h-4 text-gray-400 shrink-0 transition-transform', showBranchPicker && 'rotate-180')} />
            </button>

            {showBranchPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                {/* All Branches option */}
                <button
                  onClick={() => handleSelectBranch(null, 'All Branches')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-700 transition-colors border-b border-gray-700">
                  <div className="w-7 h-7 bg-blue-600/20 rounded-lg flex items-center justify-center shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-white text-left">All Branches</span>
                  {selectedBranchId === null && <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>

                {/* Individual branches */}
                {locations.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => handleSelectBranch(loc.id, loc.name)}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors border-b border-gray-700/50 last:border-0',
                      loc.is_active ? 'hover:bg-gray-700' : 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!loc.is_active}>
                    <div className="w-7 h-7 bg-gray-700 rounded-lg flex items-center justify-center text-gray-300 font-bold text-xs shrink-0">
                      {loc.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">{loc.name}</p>
                      {!loc.is_active && <p className="text-xs text-gray-500">Inactive</p>}
                    </div>
                    {selectedBranchId === loc.id && <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User pill */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-3 py-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
            {profile?.full_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate leading-tight">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-gray-400 capitalize">{userRole}</p>
          </div>
          <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" title="Online" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={clsx('w-4 h-4 shrink-0 transition-colors',
                  isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300')} />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-300 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
            font-medium text-gray-400 hover:bg-red-900/40 hover:text-red-400
            transition-all duration-150 group">
          <LogOut className="w-4 h-4 shrink-0 text-gray-500 group-hover:text-red-400 transition-colors" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}