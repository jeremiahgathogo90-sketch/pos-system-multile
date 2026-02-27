import { useState, useEffect, useCallback } from 'react'
import { useRealtime } from '../../hooks/useRealtime'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  Plus, Search, Edit2, Shield, User, Mail,
  MapPin, X, Loader2, RefreshCw, UserCheck,
  UserX, Crown, Users, Lock
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { Profile, Location } from '../../types/database'
type UserRole = 'owner' | 'admin' | 'accountant' | 'cashier' | 'storekeeper'

const roleConfig: Record<UserRole, { label: string; color: string; icon: any; description: string }> = {
  owner: {
    label: 'Owner',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: Crown,
    description: 'Full access to everything'
  },
  admin: {
    label: 'Admin',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Shield,
    description: 'Manage staff, inventory, reports'
  },
  accountant: {
    label: 'Accountant',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: User,
    description: 'View finances, manage customers'
  },
  cashier: {
    label: 'Cashier',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: User,
    description: 'Process sales only'
  },
  storekeeper: {
    label: 'Storekeeper',
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    icon: User,
    description: 'Manage warehouse stock & transfers'
  },
}

function UserModal({
  user, locations, onSave, onClose, currentUserRole
}: {
  user?: Profile | null
  locations: Location[]
  onSave: (data: any) => Promise<void>
  onClose: () => void
  currentUserRole: UserRole
}) {
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(user?.role || 'cashier')
  const [locationId, setLocationId] = useState(user?.location_id || '')
  const [isSaving, setIsSaving] = useState(false)

  const availableRoles: UserRole[] =
    currentUserRole === 'owner'
      ? ['owner', 'admin', 'accountant', 'cashier', 'storekeeper']
      : ['admin', 'accountant', 'cashier']

  const onSubmit = async () => {
    if (!fullName.trim()) { toast.error('Full name is required'); return }
    if (!user && !email.trim()) { toast.error('Email is required'); return }
    if (!user && !password.trim()) { toast.error('Password is required for new users'); return }
    if (!user && password.trim().length < 6) { toast.error('Password must be at least 6 characters'); return }
    const noBranchRoles = ['owner', 'accountant', 'storekeeper']
    if (!noBranchRoles.includes(role) && !locationId) { toast.error('Select a branch for this user'); return }

    setIsSaving(true)
    try {
      await onSave({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        location_id: ['owner', 'accountant', 'storekeeper'].includes(role) ? null : locationId,
      })
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save user')
    } finally {
      setIsSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-gray-50 transition-all'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        {/* ── Fixed Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">{user ? 'Edit User' : 'Add New Staff'}</h3>
            <p className="text-xs text-gray-400">
              {user ? 'Update user details and permissions' : 'Create a new staff account'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 
              flex items-center justify-center transition-colors" aria-label="Close" title="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Jane Wanjiku"
            />
          </div>

          {/* Email (new users only) */}
          {!user && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
                placeholder="jane@myshop.com"
              />
            </div>
          )}

          {/* Password (new users only) */}
          {!user && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Minimum 6 characters"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Share this password with the staff member after creation
              </p>
            </div>
          )}

          {/* Role Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Role <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableRoles.map(r => {
                const cfg = roleConfig[r]
                const Icon = cfg.icon
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={clsx(
                      'flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all',
                      role === r
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    )}>
                    <Icon className={clsx(
                      'w-4 h-4 mt-0.5 shrink-0',
                      role === r ? 'text-blue-600' : 'text-gray-400'
                    )} />
                    <div>
                      <p className={clsx(
                        'text-sm font-semibold',
                        role === r ? 'text-blue-700' : 'text-gray-700'
                      )}>
                        {cfg.label}
                      </p>
                      <p className="text-xs text-gray-400 leading-tight mt-0.5">
                        {cfg.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Branch Assignment */}
          {/* Branch — not needed for owner or accountant */}
          {role !== 'owner' && role !== 'accountant' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Assign to Branch <span className="text-red-500">*</span>
              </label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className={inputClass} aria-label="Location" title="Location">
                <option value="">-- Select Branch --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">
                This user will only see data from their assigned branch
              </p>
            </div>
          )}

          {/* Cross-branch role note */}
          {(role === 'owner' || role === 'accountant') && (
            <div className={`border rounded-xl px-4 py-3 flex items-start gap-2 ${
              role === 'owner' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
            }`}>
              <Crown className={`w-4 h-4 shrink-0 mt-0.5 ${role === 'owner' ? 'text-yellow-600' : 'text-green-600'}`} />
              <p className={`text-xs ${role === 'owner' ? 'text-yellow-700' : 'text-green-700'}`}>
                <strong>{role === 'owner' ? 'Owner' : 'Accountant'}</strong> role has access to{' '}
                <strong>all branches</strong> — no branch assignment needed.
                {role === 'accountant' && ' They can view all financial data across the whole business.'}
              </p>
            </div>
          )}

          {/* Info note for new users */}
          {!user && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 
              flex items-start gap-2">
              <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600">
                The new staff member can log in immediately after creation using
                their email and the password you set here.
              </p>
            </div>
          )}
        </div>

        {/* ── Fixed Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
              rounded-xl hover:bg-gray-50 text-sm transition-colors" aria-label="Close" title="Close">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold 
              rounded-xl text-sm flex items-center justify-center gap-2 
              disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />
                {user ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              user ? 'Update User' : 'Create User'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { profile } = useAuthStore()
  const [users, setUsers] = useState<Profile[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)

  const fetchUsers = useCallback(async () => {
    let q = supabase
      .from('profiles')
      .select('*, location:locations(id, name)')
      .order('created_at', { ascending: false })

    if (profile?.role === 'admin') {
      // Admin only sees users in their branch
      q = q.eq('location_id', profile?.location_id)
    }
    // owner sees all users — no filter

    const { data } = await q
    setUsers(data || [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, profile?.location_id])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchUsers(), fetchLocations()])
    setIsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUsers])

  useEffect(() => { fetchAll() }, [fetchAll])
  useRealtime(['profiles'], fetchUsers, [profile?.location_id])

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setLocations(data || [])
  }

  const filtered = users.filter(u => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const handleSaveUser = async (data: any) => {
    if (editingUser) {
      // Update existing profile
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: data.full_name,
          role: data.role,
          location_id: data.location_id,
        })
        .eq('id', editingUser.id)

      if (error) throw error
      toast.success('User updated successfully')
      await fetchUsers()

    } else {
      // Step 1 — Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.full_name }
        }
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create user')

      // Step 2 — Wait for trigger to fire and create the profile
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Step 3 — Force update the profile with correct role and location
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: data.full_name,
          role: data.role,
          location_id: data.location_id,
          is_active: true,
        })
        .eq('id', authData.user.id)

      if (updateError) {
        // If update fails try upsert
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role,
            location_id: data.location_id,
            is_active: true,
          })
        if (upsertError) throw upsertError
      }

      // Step 4 — Verify role was set correctly
      const { data: verifyProfile } = await supabase
        .from('profiles')
        .select('role, location_id')
        .eq('id', authData.user.id)
        .single()

      if (verifyProfile?.role !== data.role) {
        // One final attempt
        await supabase
          .from('profiles')
          .update({
            role: data.role,
            location_id: data.location_id,
          })
          .eq('id', authData.user.id)
      }

      toast.success(`✅ ${data.full_name} created as ${data.role}!`)
      await fetchUsers()
    }
  }

  const toggleActive = async (user: Profile) => {
    if (user.id === profile?.id) {
      toast.error("You can't deactivate your own account")
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !user.is_active })
      .eq('id', user.id)

    if (error) { toast.error(error.message); return }
    toast.success(user.is_active ? 'User deactivated' : 'User activated')
    fetchUsers()
  }

  // Summary metrics
  const activeUsers = users.filter(u => u.is_active).length
  const cashiers = users.filter(u => u.role === 'cashier').length
  const admins = users.filter(u => ['admin', 'owner'].includes(u.role)).length

  return (
    <div className="space-y-5">

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Staff', value: users.length,
            icon: Users, color: 'bg-blue-600', sub: 'All accounts'
          },
          {
            label: 'Active', value: activeUsers,
            icon: UserCheck, color: 'bg-green-600', sub: 'Can log in'
          },
          {
            label: 'Cashiers', value: cashiers,
            icon: User, color: 'bg-purple-600', sub: 'Sales staff'
          },
          {
            label: 'Admins & Owners', value: admins,
            icon: Shield, color: 'bg-orange-500', sub: 'Management'
          },
        ].map(card => (
          <div key={card.label}
            className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 
        flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search staff by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl 
              text-sm outline-none focus:border-blue-400"
           aria-label="Search" title="Search" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as any)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm 
              outline-none text-gray-700" aria-label="Filter by role" title="Filter by role">
            <option value="all">All Roles</option>
            {Object.entries(roleConfig).map(([r, cfg]) => (
              <option key={r} value={r}>{cfg.label}</option>
            ))}
          </select>

          <button
            onClick={fetchAll}
            className="px-3 py-2 border border-gray-200 text-gray-500 rounded-xl 
              hover:bg-gray-50 transition-colors"
            title="Refresh data" aria-label="Refresh data">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => { setEditingUser(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
              text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            Add Staff
          </button>
        </div>
      </div>

      {/* ── Users Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-400">Loading staff...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Users className="w-14 h-14 mb-3" />
            <p className="text-base font-medium text-gray-400">No staff found</p>
            <p className="text-sm text-gray-300 mt-1">
              {search ? 'Try a different search' : 'Add your first staff member'}
            </p>
            {!search && (
              <button
                onClick={() => { setEditingUser(null); setShowModal(true) }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold 
                  rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Staff Member', 'Role', 'Branch', 'Status', 'Joined', ''].map(h => (
                    <th key={h}
                      className="px-4 py-3 text-left text-xs font-semibold 
                        text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(user => {
                  const cfg = roleConfig[user.role]
                  const RoleIcon = cfg.icon
                  const isCurrentUser = user.id === profile?.id

                  return (
                    <tr key={user.id}
                      className="hover:bg-gray-50 transition-colors group">

                      {/* Name + Email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                            user.is_active
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-400'
                          )}>
                            {user.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-gray-800">
                                {user.full_name}
                              </p>
                              {isCurrentUser && (
                                <span className="text-xs bg-blue-100 text-blue-600 
                                  font-medium px-1.5 py-0.5 rounded-full">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                          'text-xs font-semibold border',
                          cfg.color
                        )}>
                          <RoleIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Branch */}
                      <td className="px-4 py-3">
                        {(user as any).location ? (
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            {(user as any).location.name}
                          </div>
                        ) : user.role === 'storekeeper' ? (
                          <span className="text-xs text-teal-700 font-semibold
                            bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                            🏭 Warehouse
                          </span>
                        ) : (
                          <span className="text-xs text-yellow-600 font-semibold
                            bg-yellow-50 px-2.5 py-1 rounded-full border border-yellow-200">
                            All Branches
                          </span>
                        )}
                      </td>

                      {/* Active toggle */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => !isCurrentUser && toggleActive(user)}
                          disabled={isCurrentUser}
                          className={clsx(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                            'text-xs font-semibold transition-all',
                            user.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-600 hover:bg-red-200',
                            isCurrentUser && 'cursor-default opacity-70'
                          )}>
                          {user.is_active
                            ? <><UserCheck className="w-3 h-3" />Active</>
                            : <><UserX className="w-3 h-3" />Inactive</>
                          }
                        </button>
                      </td>

                      {/* Date joined */}
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(user.created_at).toLocaleDateString('en-KE', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingUser(user); setShowModal(true) }}
                            className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 
                              rounded-lg flex items-center justify-center transition-colors"
                            title="Edit user">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 
              flex justify-between text-xs text-gray-500">
              <span>{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</span>
              <span>
                {activeUsers} active · {users.length - activeUsers} inactive
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Permissions Reference Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-gray-500" />
          <h4 className="font-bold text-gray-800">Role Permissions Reference</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Feature
                </th>
                {Object.entries(roleConfig).map(([r, cfg]) => (
                  <th key={r} className="text-center pb-3">
                    <span className={clsx(
                      'inline-block px-2.5 py-1 rounded-full text-xs font-semibold border',
                      cfg.color
                    )}>
                      {cfg.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { feature: 'Make Sales (POS)',        perms: [true,  true,  true,  true]  },
                { feature: 'View Own Sales',           perms: [true,  true,  true,  true]  },
                { feature: 'View All Branch Sales',    perms: [true,  true,  true,  false] },
                { feature: 'Manage Inventory',         perms: [true,  true,  true,  false] },
                { feature: 'Import / Export CSV',      perms: [true,  true,  true,  false] },
                { feature: 'Customers & Credit',       perms: [true,  true,  true,  false] },
                { feature: 'Suppliers & Debts',        perms: [true,  true,  true,  false] },
                { feature: 'Purchase Orders',          perms: [true,  true,  true,  false] },
                { feature: 'Financial Reports',        perms: [true,  true,  true,  false] },
                { feature: 'Manage Staff',             perms: [true,  true,  false, false] },
                { feature: 'Store Settings',           perms: [true,  true,  false, false] },
                { feature: 'Add / Edit Branches',      perms: [true,  false, false, false] },
                { feature: 'All Branches Access',      perms: [true,  false, false, false] },
              ].map(row => (
                <tr key={row.feature}>
                  <td className="py-2.5 text-sm text-gray-700 font-medium pr-4">
                    {row.feature}
                  </td>
                  {row.perms.map((allowed, i) => (
                    <td key={i} className="py-2.5 text-center">
                      {allowed
                        ? <span className="text-green-500 font-bold text-lg">✓</span>
                        : <span className="text-gray-200 font-bold text-lg">✗</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <UserModal
          user={editingUser}
          locations={locations}
          currentUserRole={profile?.role || 'admin'}
          onSave={handleSaveUser}
          onClose={() => { setShowModal(false); setEditingUser(null) }}
        />
      )}
    </div>
  )
}