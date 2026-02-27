import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'
import {
  Store, MapPin, Save, Plus, Trash2, Loader2,
  Building2, Phone, Globe, FileText, AlertTriangle,
  CheckCircle, Settings
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface StoreSettings {
  id?: string
  location_id: string
  store_name: string
  currency: string
  tax_rate: number
  low_stock_threshold: number
  receipt_footer: string
  phone?: string
  address?: string
  website?: string
}

interface Location {
  id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
}

const currencies = [
  { code: 'KES', label: 'Kenyan Shilling (KES)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { code: 'TZS', label: 'Tanzanian Shilling (TZS)' },
  { code: 'RWF', label: 'Rwandan Franc (RWF)' },
  { code: 'ZAR', label: 'South African Rand (ZAR)' },
]

// Default empty settings — used before DB loads
const emptySettings = (locationId: string): StoreSettings => ({
  location_id:         locationId,
  store_name:          '',
  currency:            'KES',
  tax_rate:            0,
  low_stock_threshold: 10,
  receipt_footer:      '',
  phone:               '',
  address:             '',
  website:             '',
})

export default function SettingsPage() {
  const { profile } = useAuthStore()

  // ── Local form state — only updated by user typing or initial load ──
  const [form, setForm]           = useState<StoreSettings>(emptySettings(''))
  const [settingsId, setSettingsId] = useState<string | null>(null)

  const [locations, setLocations]       = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [isLoadingSettings, setIsLoadingSettings] = useState(false)
  const [isSaving, setIsSaving]         = useState(false)
  const [isDirty, setIsDirty]           = useState(false)

  // Branch management
  const [newBranchName, setNewBranchName]       = useState('')
  const [newBranchAddress, setNewBranchAddress] = useState('')
  const [newBranchPhone, setNewBranchPhone]     = useState('')
  const [isAddingBranch, setIsAddingBranch]     = useState(false)
  const [showAddBranch, setShowAddBranch]       = useState(false)

  // ── Load locations once on mount ──
  useEffect(() => {
    fetchLocations()
  }, [])

  // ── When selected location changes, load its settings ONCE ──
  useEffect(() => {
    if (selectedLocation) {
      loadSettings(selectedLocation)
    }
  }, [selectedLocation])

  const fetchLocations = async () => {
    const { data } = await supabase.from('locations').select('*').order('name')
    const locs = data || []
    setLocations(locs)

    // Auto-select: use profile's location, or first location
    const defaultLoc = profile?.location_id || locs[0]?.id || ''
    setSelectedLocation(defaultLoc)
  }

  // ── Load settings from DB into local state (called ONCE per location) ──
  const loadSettings = async (locationId: string) => {
    setIsLoadingSettings(true)
    setIsDirty(false)
    try {
      const { data } = await supabase
        .from('store_settings')
        .select('*')
        .eq('location_id', locationId)
        .single()

      if (data) {
        // Populate form from DB — only happens here, not on every keystroke
        setForm({
          location_id:         locationId,
          store_name:          data.store_name          || '',
          currency:            data.currency            || 'KES',
          tax_rate:            data.tax_rate            ?? 0,
          low_stock_threshold: data.low_stock_threshold ?? 10,
          receipt_footer:      data.receipt_footer      || '',
          phone:               data.phone               || '',
          address:             data.address             || '',
          website:             data.website             || '',
        })
        setSettingsId(data.id)
      } else {
        // No settings yet for this location — use defaults
        setForm(emptySettings(locationId))
        setSettingsId(null)
      }
    } catch {
      setForm(emptySettings(locationId))
      setSettingsId(null)
    } finally {
      setIsLoadingSettings(false)
    }
  }

  // ── Single field updater — updates local state ONLY, no DB call ──
  const updateField = (field: keyof StoreSettings, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  // ── Save — only writes to DB when user explicitly clicks Save ──
  const handleSave = async () => {
    if (!form.location_id) return
    setIsSaving(true)
    try {
      const payload = {
        location_id:         form.location_id,
        store_name:          form.store_name.trim(),
        currency:            form.currency,
        tax_rate:            Number(form.tax_rate) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 10,
        receipt_footer:      form.receipt_footer.trim(),
        phone:               form.phone?.trim() || null,
        address:             form.address?.trim() || null,
        website:             form.website?.trim() || null,
      }

      if (settingsId) {
        // Update existing
        const { error } = await supabase
          .from('store_settings')
          .update(payload)
          .eq('id', settingsId)
        if (error) throw error
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('store_settings')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        setSettingsId(data.id)
      }

      setIsDirty(false)
      toast.success('Settings saved successfully!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) { toast.error('Branch name required'); return }
    setIsAddingBranch(true)
    try {
      const { data, error } = await supabase.from('locations').insert({
        name:    newBranchName.trim(),
        address: newBranchAddress.trim() || null,
        phone:   newBranchPhone.trim()   || null,
        is_active: true,
      }).select().single()
      if (error) throw error

      // Create default settings for the new branch
      await supabase.from('store_settings').insert({
        location_id:         data.id,
        store_name:          newBranchName.trim(),
        currency:            'KES',
        tax_rate:            0,
        low_stock_threshold: 10,
      })

      toast.success(`Branch "${data.name}" created!`)
      setNewBranchName(''); setNewBranchAddress(''); setNewBranchPhone('')
      setShowAddBranch(false)
      await fetchLocations()
      setSelectedLocation(data.id)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create branch')
    } finally {
      setIsAddingBranch(false) }
  }

  const handleToggleBranch = async (loc: Location) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ is_active: !loc.is_active })
        .eq('id', loc.id)
      if (error) throw error
      toast.success(`Branch ${loc.is_active ? 'deactivated' : 'activated'}`)
      fetchLocations()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update branch')
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure your store and branches</p>
        </div>
        {isDirty && (
          <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5" />
            Unsaved changes
          </div>
        )}
      </div>

      {/* Location selector — only shown to owner */}
      {profile?.role === 'owner' && locations.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />Configure Branch
          </label>
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50 font-medium"
            aria-label="Select branch to configure"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}{!loc.is_active ? ' (inactive)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      {/* Store Configuration */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Store Configuration</h2>
            <p className="text-xs text-gray-400">Basic store information and preferences</p>
          </div>
        </div>

        {isLoadingSettings ? (
          <div className="py-12 text-center">
            <Loader2 className="w-7 h-7 animate-spin mx-auto text-blue-500" />
            <p className="text-sm text-gray-400 mt-2">Loading settings...</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">

            {/* Store Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Store Name</label>
              <input
                type="text"
                value={form.store_name}
                onChange={e => updateField('store_name', e.target.value)}
                placeholder="e.g. My Shop"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50"
              />
            </div>

            {/* Currency + Tax Rate */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Currency</label>
                <select
                  value={form.currency}
                  onChange={e => updateField('currency', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50"
                  aria-label="Currency selector"
                >
                  {currencies.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tax Rate (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.tax_rate}
                    onChange={e => updateField('tax_rate', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50 pr-8"
                    aria-label="Tax rate input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Set to 0 for no tax</p>
              </div>
            </div>

            {/* Phone + Address */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />Phone
                </label>
                <input
                  type="tel"
                  value={form.phone || ''}
                  onChange={e => updateField('phone', e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />Website
                </label>
                <input
                  type="url"
                  value={form.website || ''}
                  onChange={e => updateField('website', e.target.value)}
                  placeholder="https://myshop.co.ke"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />Address
              </label>
              <input
                type="text"
                value={form.address || ''}
                onChange={e => updateField('address', e.target.value)}
                placeholder="e.g. Westlands, Nairobi"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50"
              />
            </div>

            {/* Low Stock Threshold */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Low Stock Alert Threshold</label>
              <input
                type="number"
                min="1"
                value={form.low_stock_threshold}
                onChange={e => updateField('low_stock_threshold', parseInt(e.target.value) || 10)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50"
                aria-label="Low stock threshold input" 
              />
              <p className="text-xs text-gray-400 mt-1">Products below this quantity will show low stock warnings</p>
            </div>

            {/* Receipt Footer */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />Receipt Footer Message
              </label>
              <textarea
                rows={3}
                value={form.receipt_footer}
                onChange={e => updateField('receipt_footer', e.target.value)}
                placeholder="e.g. Thank you for shopping with us! Goods once sold cannot be returned."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 bg-gray-50 resize-none"
              />
            </div>

            {/* Save Button */}
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={clsx(
                  'flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all',
                  isDirty
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100'
                    : 'bg-gray-100 text-gray-500 cursor-default'
                )}
              >
                {isSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                  : <><Save className="w-4 h-4" />Save Settings</>
                }
              </button>
              {!isDirty && !isSaving && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle className="w-3.5 h-3.5" />All changes saved
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Branch Management — owner only */}
      {profile?.role === 'owner' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-800">Branch Management</h2>
                <p className="text-xs text-gray-400">{locations.length} branch{locations.length !== 1 ? 'es' : ''}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddBranch(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />Add Branch
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {locations.map(loc => (
              <div key={loc.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm',
                    loc.is_active ? 'bg-purple-500' : 'bg-gray-300')}>
                    {loc.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{loc.name}</p>
                    {loc.address && <p className="text-xs text-gray-400">{loc.address}</p>}
                    {loc.phone   && <p className="text-xs text-gray-400">{loc.phone}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full',
                    loc.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {loc.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {profile.role === 'owner' && (
                    <button
                      onClick={() => handleToggleBranch(loc)}
                      className={clsx('text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                        loc.is_active
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      )}>
                      {loc.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add Branch Form */}
          {showAddBranch && (
            <div className="border-t border-gray-200 px-6 py-5 bg-purple-50">
              <p className="text-sm font-bold text-gray-700 mb-3">New Branch Details</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="Branch Name *"
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 bg-white"
                />
                <input
                  type="text"
                  value={newBranchAddress}
                  onChange={e => setNewBranchAddress(e.target.value)}
                  placeholder="Address (optional)"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 bg-white"
                />
                <input
                  type="tel"
                  value={newBranchPhone}
                  onChange={e => setNewBranchPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 bg-white"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowAddBranch(false); setNewBranchName(''); setNewBranchAddress(''); setNewBranchPhone('') }}
                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-white text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddBranch}
                    disabled={isAddingBranch || !newBranchName.trim()}
                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isAddingBranch ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Branch</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}