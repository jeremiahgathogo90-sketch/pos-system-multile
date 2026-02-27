import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../hooks/useRealtime'
import {
  Shield, Search, RefreshCw, Loader2,
  ShoppingCart, Trash2, TrendingDown, LogOut,
  Edit3, AlertTriangle, Filter
} from 'lucide-react'
import { clsx } from 'clsx'

interface AuditEntry {
  id: string
  created_at: string
  user_name: string | null
  user_role: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_value: any
  new_value: any
  meta: any
  location_id: string | null
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  sale_created:            { label: 'Sale Created',         color: 'bg-green-100 text-green-700',  icon: ShoppingCart  },
  sale_deleted:            { label: 'Sale Deleted',          color: 'bg-red-100 text-red-700',      icon: Trash2        },
  purchase_order_deleted:  { label: 'PO Deleted',           color: 'bg-red-100 text-red-700',      icon: Trash2        },
  product_price_changed:   { label: 'Price Changed',        color: 'bg-orange-100 text-orange-700',icon: TrendingDown  },
  session_timeout:         { label: 'Session Timeout',      color: 'bg-gray-100 text-gray-600',    icon: LogOut        },
}

const getActionConfig = (action: string) =>
  ACTION_CONFIG[action] ?? { label: action.replace(/_/g,' '), color: 'bg-blue-100 text-blue-700', icon: Edit3 }

export default function AuditLogPage() {
  const [entries, setEntries]         = useState<AuditEntry[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [search, setSearch]           = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [expanded, setExpanded]       = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      const { data, error } = await q
      if (error) throw error
      setEntries(data || [])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])
  useRealtime(['audit_log'], fetchEntries, [])

  const filtered = entries.filter(e => {
    const matchSearch = !search ||
      (e.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
      e.action.toLowerCase().includes(search.toLowerCase())
    const matchAction = actionFilter === 'all' || e.action === actionFilter
    return matchSearch && matchAction
  })

  const uniqueActions = [...new Set(entries.map(e => e.action))]

  const formatValue = (val: any) => {
    if (!val) return null
    try {
      return JSON.stringify(val, null, 2)
    } catch {
      return String(val)
    }
  }

  // Summary counts
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
  const todayEntries = entries.filter(e => new Date(e.created_at) >= todayStart)
  const deletions    = todayEntries.filter(e => e.action.includes('deleted')).length
  const priceChanges = todayEntries.filter(e => e.action === 'product_price_changed').length
  const timeouts     = todayEntries.filter(e => e.action === 'session_timeout').length

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">Audit Log</h1>
            <p className="text-sm text-gray-500">Full history of all security events and changes</p>
          </div>
        </div>
        <button onClick={fetchEntries} disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />Refresh
        </button>
      </div>

      {/* Today summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Events", value: todayEntries.length, color: 'bg-blue-600',   icon: Shield,        sub: 'Total audit entries' },
          { label: 'Deletions',      value: deletions,           color: 'bg-red-500',    icon: Trash2,        sub: 'Records deleted today' },
          { label: 'Price Changes',  value: priceChanges,        color: 'bg-orange-500', icon: TrendingDown,  sub: 'Product prices modified' },
          { label: 'Timeouts',       value: timeouts,            color: 'bg-gray-600',   icon: LogOut,        sub: 'Sessions expired today' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-3xl font-black text-gray-800 mt-1">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by user or action..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none text-gray-700" aria-label="Select action type filter">
            <option value="all">All Actions</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{getActionConfig(a).label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} entries</span>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-400">Loading audit log...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400 font-medium">No events found</p>
            <p className="text-sm text-gray-300 mt-1">Events appear here as actions are performed in the system</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Time', 'User', 'Role', 'Action', 'Details', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(entry => {
                  const cfg = getActionConfig(entry.action)
                  const Icon = cfg.icon
                  const isOpen = expanded === entry.id
                  const isDangerous = entry.action.includes('deleted')

                  return (
                    <Fragment key={entry.id}>
                      <tr
                        className={clsx('transition-colors', isDangerous ? 'bg-red-50/30' : 'hover:bg-gray-50')}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs font-medium text-gray-800">
                            {new Date(entry.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short' })}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(entry.created_at).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                              {(entry.user_name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-800 text-xs">{entry.user_name || 'System'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs capitalize text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {entry.user_role || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.color)}>
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                          {entry.action === 'product_price_changed' && entry.old_value && entry.new_value ? (
                            <span>
                              <strong>{entry.new_value?.product_name}</strong>:{' '}
                              KES {entry.old_value?.selling_price} → KES {entry.new_value?.selling_price}
                            </span>
                          ) : entry.action === 'sale_deleted' ? (
                            <span>KES {entry.old_value?.total_amount?.toLocaleString()} · {entry.old_value?.payment_method}</span>
                          ) : entry.action === 'sale_created' ? (
                            <span>KES {entry.new_value?.total_amount?.toLocaleString()} · {entry.new_value?.payment_method}</span>
                          ) : entry.meta ? (
                            <span>{JSON.stringify(entry.meta).slice(0,60)}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {(entry.old_value || entry.new_value || entry.meta) && (
                            <button
                              onClick={() => setExpanded(isOpen ? null : entry.id)}
                              className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                              {isOpen ? 'Hide' : 'View'}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isOpen && (
                        <tr key={`${entry.id}-detail`} className="bg-gray-50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {entry.old_value && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1 uppercase tracking-wide">Before</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-3 text-gray-700 overflow-auto max-h-32 text-xs">
                                    {formatValue(entry.old_value)}
                                  </pre>
                                </div>
                              )}
                              {entry.new_value && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1 uppercase tracking-wide">After</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-3 text-gray-700 overflow-auto max-h-32 text-xs">
                                    {formatValue(entry.new_value)}
                                  </pre>
                                </div>
                              )}
                              {entry.meta && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1 uppercase tracking-wide">Meta</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-3 text-gray-700 overflow-auto max-h-32 text-xs">
                                    {formatValue(entry.meta)}
                                  </pre>
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-gray-500 mb-1 uppercase tracking-wide">Record ID</p>
                                <p className="font-mono text-gray-600 bg-white border border-gray-200 rounded-lg p-3 break-all">
                                  {entry.record_id || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex justify-between">
              <span>Showing last 200 events</span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-orange-400" />
                Audit log is append-only — records cannot be deleted
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}