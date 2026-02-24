import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore, getEffectiveLocationId } from '../../store/branchStore'
import { useRealtime } from '../../hooks/useRealtime'
import { supabase } from '../../lib/supabase'
import {
  TrendingUp, ShoppingCart, Users, Package,
  Banknote, CreditCard, Smartphone, User,
  ArrowUpRight, RefreshCw, Activity, Building2
} from 'lucide-react'
import { clsx } from 'clsx'

interface DashboardStats {
  todaySales:     number
  todayRevenue:   number
  totalCustomers: number
  lowStockCount:  number
  cashTotal:      number
  cardTotal:      number
  mpesaTotal:     number
  creditTotal:    number
  recentSales:    any[]
}

const methodColors: Record<string, string> = {
  cash:         'bg-green-100  text-green-700',
  card:         'bg-blue-100   text-blue-700',
  mobile_money: 'bg-purple-100 text-purple-700',
  credit:       'bg-orange-100 text-orange-700',
  split:        'bg-gray-100   text-gray-600',
}

function methodLabel(m: string) {
  if (m === 'mobile_money') return 'M-Pesa'
  if (!m) return '—'
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const { selectedBranchId, selectedBranchName } = useBranchStore()

  const effectiveLocationId = getEffectiveLocationId(
    profile?.role,
    profile?.location_id,
    selectedBranchId
  )

  const [stats, setStats]           = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading]   = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const fetchStats = useCallback(async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // ── Sales query ──
      let salesQ = supabase
        .from('sales')
        .select(`
          id,
          total_amount,
          payment_method,
          created_at,
          customer:customers(name),
          sale_payments(method, amount)
        `)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(50)

      if (effectiveLocationId) salesQ = salesQ.eq('location_id', effectiveLocationId)

      // ── Customers count ──
      let customersQ = supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
      if (effectiveLocationId) customersQ = customersQ.eq('location_id', effectiveLocationId)

      // ── Low stock count ──
      let stockQ = supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .lt('stock_quantity', 10)
      if (effectiveLocationId) stockQ = stockQ.eq('location_id', effectiveLocationId)

      const [salesRes, customersRes, stockRes] = await Promise.all([
        salesQ, customersQ, stockQ
      ])

      const sales: any[] = (salesRes.data || []).filter(s => s && s.id)

      // Sum payment amounts from sale_payments; fallback to payment_method column
      let cash = 0, card = 0, mpesa = 0, credit = 0
      for (const sale of sales) {
        const pmts: any[] = sale.sale_payments || []
        if (pmts.length > 0) {
          for (const p of pmts) {
            if (p.method === 'cash')         cash   += Number(p.amount) || 0
            if (p.method === 'card')         card   += Number(p.amount) || 0
            if (p.method === 'mobile_money') mpesa  += Number(p.amount) || 0
            if (p.method === 'credit')       credit += Number(p.amount) || 0
          }
        } else {
          const a = Number(sale.total_amount) || 0
          if (sale.payment_method === 'cash')         cash   += a
          if (sale.payment_method === 'card')         card   += a
          if (sale.payment_method === 'mobile_money') mpesa  += a
          if (sale.payment_method === 'credit')       credit += a
        }
      }

      setStats({
        todaySales:     sales.length,
        todayRevenue:   sales.reduce((s, sale) => s + (Number(sale.total_amount) || 0), 0),
        totalCustomers: customersRes.count || 0,
        lowStockCount:  stockRes.count    || 0,
        cashTotal:   cash,
        cardTotal:   card,
        mpesaTotal:  mpesa,
        creditTotal: credit,
        recentSales: sales.slice(0, 8),
      })
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [effectiveLocationId])

  useEffect(() => {
    setIsLoading(true)
    fetchStats()
  }, [fetchStats])

  // Real-time updates
  useRealtime(['sales', 'sale_payments', 'products', 'customers'], fetchStats, [effectiveLocationId])

  const branchLabel = (profile?.role === 'owner' || profile?.role === 'accountant')
    ? selectedBranchName
    : (profile?.location?.name || 'My Branch')

  if (isLoading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
        <p className="text-sm text-gray-400">Loading dashboard...</p>
      </div>
    </div>
  )

  const revenue = stats?.todayRevenue || 0

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Dashboard</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-sm text-gray-500">{branchLabel}</p>
            <span className="text-gray-300">·</span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <p className="text-xs text-green-600 font-medium">Live</p>
            </div>
            <span className="text-gray-300">·</span>
            <p className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setIsLoading(true); fetchStats() }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Today's Revenue",
            value: `KES ${revenue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
            icon: TrendingUp,
            colors: 'bg-blue-50 border-blue-200',
            text: 'text-blue-700',
            iconColor: 'text-blue-500',
          },
          {
            label: "Today's Sales",
            value: stats?.todaySales ?? 0,
            icon: ShoppingCart,
            colors: 'bg-green-50 border-green-200',
            text: 'text-green-700',
            iconColor: 'text-green-500',
          },
          {
            label: 'Total Customers',
            value: stats?.totalCustomers ?? 0,
            icon: Users,
            colors: 'bg-purple-50 border-purple-200',
            text: 'text-purple-700',
            iconColor: 'text-purple-500',
          },
          {
            label: 'Low Stock Items',
            value: stats?.lowStockCount ?? 0,
            icon: Package,
            colors: (stats?.lowStockCount ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200',
            text:   (stats?.lowStockCount ?? 0) > 0 ? 'text-red-700' : 'text-gray-700',
            iconColor: (stats?.lowStockCount ?? 0) > 0 ? 'text-red-500' : 'text-gray-400',
          },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className={clsx('border rounded-2xl p-5', card.colors)}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                  <Icon className={clsx('w-5 h-5', card.iconColor)} />
                </div>
                <ArrowUpRight className={clsx('w-4 h-4', card.iconColor)} />
              </div>
              <p className={clsx('text-2xl font-black', card.text)}>{card.value}</p>
              <p className={clsx('text-sm font-medium mt-1 opacity-70', card.text)}>{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Payment Breakdown */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-800">Today's Payment Breakdown</h2>
            <p className="text-xs text-gray-400 mt-0.5">All payment methods today</p>
          </div>
          <Activity className="w-5 h-5 text-gray-300" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Cash',   value: stats?.cashTotal  ?? 0, icon: Banknote,   bg: 'bg-green-50  border-green-200',  text: 'text-green-700',  bar: 'bg-green-500'  },
            { label: 'Card',   value: stats?.cardTotal  ?? 0, icon: CreditCard, bg: 'bg-blue-50   border-blue-200',   text: 'text-blue-700',   bar: 'bg-blue-500'   },
            { label: 'M-Pesa', value: stats?.mpesaTotal ?? 0, icon: Smartphone, bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', bar: 'bg-purple-500' },
            { label: 'Credit', value: stats?.creditTotal ?? 0,icon: User,       bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', bar: 'bg-orange-500' },
          ].map(item => {
            const Icon = item.icon
            const pct  = revenue > 0 ? Math.round((item.value / revenue) * 100) : 0
            return (
              <div key={item.label} className={clsx('border rounded-xl p-4', item.bg)}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={clsx('w-4 h-4', item.text)} />
                  <p className={clsx('text-sm font-semibold', item.text)}>{item.label}</p>
                </div>
                <p className={clsx('text-xl font-black', item.text)}>
                  KES {item.value.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full transition-all duration-500', item.bar)}
                    style={{ width: `${pct}%` }} />
                </div>
                <p className={clsx('text-xs mt-1 opacity-60', item.text)}>{pct}% of total</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">Recent Transactions</h2>
            <p className="text-xs text-gray-400 mt-0.5">Today's sales — updates live</p>
          </div>
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-green-600 font-semibold">Live</span>
          </div>
        </div>

        {!stats?.recentSales?.length ? (
          <div className="py-12 text-center">
            <ShoppingCart className="w-10 h-10 mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No sales today yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Sale #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Customer</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Payment</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.recentSales.map((sale: any) => {
                // Guard: skip rows with no id
                if (!sale?.id) return null

                const pmts: any[] = sale.sale_payments || []
                const methods: string[] = pmts.length > 0
                  ? [...new Set(pmts.map((p: any) => p.method as string))]
                  : [sale.payment_method || 'cash']

                return (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg font-semibold">
                        #{(sale.id as string).slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">
                      {sale.customer?.name
                        ? sale.customer.name
                        : <span className="text-gray-400">Walk-In</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">
                      KES {(Number(sale.total_amount) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {methods.map((m: string) => (
                          <span
                            key={m}
                            className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', methodColors[m] || 'bg-gray-100 text-gray-600')}
                          >
                            {methodLabel(m)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-gray-400">
                      {new Date(sale.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}