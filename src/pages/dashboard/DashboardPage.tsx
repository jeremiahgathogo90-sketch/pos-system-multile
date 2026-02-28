import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore, getEffectiveLocationId } from '../../store/branchStore'
import { supabase } from '../../lib/supabase'
import {
  TrendingUp, ShoppingCart, Users, Package,
  Banknote, CreditCard, Smartphone, User,
  ArrowUpRight, RefreshCw, Activity, Building2,
  TrendingDown, Percent
} from 'lucide-react'
import { clsx } from 'clsx'

interface BranchStat {
  location_id: string
  name: string
  revenue: number
  cost: number
  profit: number
  profitPct: number
  salesCount: number
}

interface DashboardStats {
  todaySales:     number
  todayRevenue:   number
  totalCost:      number
  totalProfit:    number
  profitPct:      number
  totalCustomers: number
  lowStockCount:  number
  cashTotal:      number
  cardTotal:      number
  mpesaTotal:     number
  creditTotal:    number
  recentSales:    any[]
  branchBreakdown: BranchStat[]
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
  const isOwner = profile?.role === 'owner'

  const effectiveLocationId = getEffectiveLocationId(
    profile?.role,
    profile?.location_id,
    selectedBranchId
  )

  const [stats, setStats]             = useState<DashboardStats | null>(null)
  const [priceMap, setPriceMap]       = useState<Record<string, number>>({})
  const [isLoading, setIsLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const fetchStats = useCallback(async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // ── Sales query — include sale_items for profit calc ──
      let salesQ = supabase
        .from('sales')
        .select(`
          id,
          total_amount,
          payment_method,
          created_at,
          location_id,
          customer:customers(name),
          cashier:profiles(full_name),
          sale_payments(method, amount),
          sale_items(quantity, unit_price, total_price, product_id)
        `)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(200)

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

      // ── Locations (for branch breakdown) ──
      const locQ = supabase.from('locations').select('id, name').order('name')
      // Fetch product buying prices separately (nested join not supported via REST alias)
      const prodQ = supabase.from('products').select('id, buying_price').eq('is_active', true)

      const [salesRes, customersRes, stockRes, locRes, prodRes] = await Promise.all([
        salesQ, customersQ, stockQ, locQ, prodQ
      ])

      const sales: any[] = (salesRes.data || []).filter(s => s && s.id)
      const locations: { id: string; name: string }[] = locRes.data || []

      // Build a productId → buying_price map for profit calculation
      const priceMap: Record<string, number> = {}
      for (const p of (prodRes.data || [])) {
        priceMap[p.id] = Number(p.buying_price) || 0
      }
      setPriceMap(priceMap)

      // ── Payment breakdown ──
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

      // ── Profit calculation ──
      // profit = selling price (total_amount) - cost (qty × buying_price from priceMap)
      let totalRevenue = 0
      let totalCost    = 0
      for (const sale of sales) {
        totalRevenue += Number(sale.total_amount) || 0
        const items: any[] = sale.sale_items || []
        for (const item of items) {
          const buyingPrice = priceMap[item.product_id] ?? 0
          totalCost += (Number(item.quantity) || 0) * buyingPrice
        }
      }
      const totalProfit = totalRevenue - totalCost
      const profitPct   = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

      // ── Branch breakdown (owner only) ──
      const branchMap: Record<string, BranchStat> = {}
      if (isOwner) {
        for (const loc of locations) {
          branchMap[loc.id] = {
            location_id: loc.id,
            name: loc.name,
            revenue: 0, cost: 0, profit: 0, profitPct: 0, salesCount: 0
          }
        }
        for (const sale of sales) {
          const lid = sale.location_id
          if (!lid) continue
          if (!branchMap[lid]) {
            const loc = locations.find(l => l.id === lid)
            branchMap[lid] = {
              location_id: lid,
              name: loc?.name || 'Unknown Branch',
              revenue: 0, cost: 0, profit: 0, profitPct: 0, salesCount: 0
            }
          }
          branchMap[lid].revenue    += Number(sale.total_amount) || 0
          branchMap[lid].salesCount += 1
          const items: any[] = sale.sale_items || []
          for (const item of items) {
            const bp = priceMap[item.product_id] ?? 0
            branchMap[lid].cost += (Number(item.quantity) || 0) * bp
          }
        }
        // calculate profit & margin per branch
        for (const b of Object.values(branchMap)) {
          b.profit    = b.revenue - b.cost
          b.profitPct = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0
        }
      }

      setStats({
        todaySales:     sales.length,
        todayRevenue:   totalRevenue,
        totalCost,
        totalProfit,
        profitPct,
        totalCustomers: customersRes.count || 0,
        lowStockCount:  stockRes.count    || 0,
        cashTotal:   cash,
        cardTotal:   card,
        mpesaTotal:  mpesa,
        creditTotal: credit,
        recentSales: sales.slice(0, 8),
        branchBreakdown: Object.values(branchMap).filter(b => b.salesCount > 0)
          .sort((a, b) => b.revenue - a.revenue),
      })
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [effectiveLocationId, isOwner])

  useEffect(() => {
    setIsLoading(true)
    fetchStats()
  }, [fetchStats])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(fetchStats, 30_000)
    return () => clearInterval(timer)
  }, [fetchStats])

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

  const revenue    = stats?.todayRevenue || 0
  const profit     = stats?.totalProfit  || 0
  const profitPct  = stats?.profitPct    || 0
  const isAllBranches = isOwner && !selectedBranchId

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
      <div className={clsx('grid gap-4', isOwner ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4')}>
        {/* Revenue */}
        <div className="border rounded-2xl p-5 bg-blue-50 border-blue-200">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-700">
            KES {revenue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm font-medium mt-1 opacity-70 text-blue-700">Today's Revenue</p>
          {isOwner && stats?.totalCost != null && (
            <p className="text-xs text-blue-500 mt-1 opacity-80">
              Cost: KES {(stats.totalCost).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
            </p>
          )}
        </div>

        {/* Profit — owner only */}
        {isOwner ? (
          <div className={clsx('border rounded-2xl p-5',
            profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200')}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                {profit >= 0
                  ? <Percent className="w-5 h-5 text-emerald-500" />
                  : <TrendingDown className="w-5 h-5 text-red-500" />
                }
              </div>
              <span className={clsx('text-xs font-black px-2 py-0.5 rounded-full',
                profit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                {profit >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
              </span>
            </div>
            <p className={clsx('text-2xl font-black', profit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              KES {Math.abs(profit).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
            </p>
            <p className={clsx('text-sm font-medium mt-1 opacity-70', profit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              {profit >= 0 ? "Today's Profit" : "Today's Loss"}
            </p>
            <p className={clsx('text-xs mt-1', profit >= 0 ? 'text-emerald-500' : 'text-red-400')}>
              Selling − buying price
            </p>
          </div>
        ) : (
          <div className="border rounded-2xl p-5 bg-green-50 border-green-200">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                <ShoppingCart className="w-5 h-5 text-green-500" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-black text-green-700">{stats?.todaySales ?? 0}</p>
            <p className="text-sm font-medium mt-1 opacity-70 text-green-700">Today's Sales</p>
          </div>
        )}

        {/* Sales (owner shows this as 3rd card) */}
        {isOwner ? (
          <div className="border rounded-2xl p-5 bg-green-50 border-green-200">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                <ShoppingCart className="w-5 h-5 text-green-500" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-black text-green-700">{stats?.todaySales ?? 0}</p>
            <p className="text-sm font-medium mt-1 opacity-70 text-green-700">Today's Sales</p>
          </div>
        ) : (
          <div className="border rounded-2xl p-5 bg-purple-50 border-purple-200">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                <Users className="w-5 h-5 text-purple-500" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-black text-purple-700">{stats?.totalCustomers ?? 0}</p>
            <p className="text-sm font-medium mt-1 opacity-70 text-purple-700">Total Customers</p>
          </div>
        )}

        {/* Customers / Low stock */}
        {isOwner ? (
          <div className="border rounded-2xl p-5 bg-purple-50 border-purple-200">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                <Users className="w-5 h-5 text-purple-500" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-black text-purple-700">{stats?.totalCustomers ?? 0}</p>
            <p className="text-sm font-medium mt-1 opacity-70 text-purple-700">Total Customers</p>
          </div>
        ) : (
          <div className={clsx('border rounded-2xl p-5',
            (stats?.lowStockCount ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60">
                <Package className={clsx('w-5 h-5', (stats?.lowStockCount ?? 0) > 0 ? 'text-red-500' : 'text-gray-400')} />
              </div>
              <ArrowUpRight className={clsx('w-4 h-4', (stats?.lowStockCount ?? 0) > 0 ? 'text-red-500' : 'text-gray-400')} />
            </div>
            <p className={clsx('text-2xl font-black', (stats?.lowStockCount ?? 0) > 0 ? 'text-red-700' : 'text-gray-700')}>
              {stats?.lowStockCount ?? 0}
            </p>
            <p className={clsx('text-sm font-medium mt-1 opacity-70', (stats?.lowStockCount ?? 0) > 0 ? 'text-red-700' : 'text-gray-700')}>
              Low Stock Items
            </p>
          </div>
        )}
      </div>

      {/* ── Branch Profit Breakdown — Owner, All Branches view ── */}
      {isOwner && isAllBranches && stats && stats.branchBreakdown.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800">Profit by Branch — Today</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Selling price minus buying price per branch · {stats.branchBreakdown.length} active
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <Percent className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs text-emerald-700 font-bold">
                Overall {profitPct.toFixed(1)}% margin
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Branch</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Sales</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Profit</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.branchBreakdown.map(b => (
                  <tr key={b.location_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="font-semibold text-gray-800">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-700">{b.salesCount}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-800">
                        KES {b.revenue.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-500">
                        KES {b.cost.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={clsx('font-black',
                        b.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {b.profit >= 0 ? '+' : ''}KES {Math.abs(b.profit).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={clsx('h-full rounded-full', b.profit >= 0 ? 'bg-emerald-500' : 'bg-red-400')}
                            style={{ width: `${Math.min(100, Math.abs(b.profitPct))}%` }}
                          />
                        </div>
                        <span className={clsx('text-xs font-black w-12 text-right',
                          b.profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {b.profit >= 0 ? '+' : ''}{b.profitPct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-5 py-3 font-black text-gray-800">Total</td>
                  <td className="px-4 py-3 text-right font-black text-gray-800">{stats.todaySales}</td>
                  <td className="px-4 py-3 text-right font-black text-gray-800">
                    KES {revenue.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-600">
                    KES {(stats.totalCost).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={clsx('font-black text-base', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {profit >= 0 ? '+' : ''}KES {Math.abs(profit).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={clsx('font-black', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {profit >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Single-branch profit summary (owner, specific branch selected) */}
      {isOwner && !isAllBranches && revenue > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-bold text-gray-800 mb-4">
            Profit Summary — {branchLabel}
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Revenue', value: revenue, color: 'text-blue-700', bg: 'bg-blue-50', desc: 'Total sold' },
              { label: 'Cost',    value: stats?.totalCost || 0, color: 'text-gray-700', bg: 'bg-gray-50', desc: 'Buying price total' },
              { label: profit >= 0 ? 'Profit' : 'Loss', value: Math.abs(profit), color: profit >= 0 ? 'text-emerald-700' : 'text-red-700', bg: profit >= 0 ? 'bg-emerald-50' : 'bg-red-50', desc: `${profit >= 0 ? '+' : ''}${profitPct.toFixed(1)}% margin` },
            ].map(item => (
              <div key={item.label} className={clsx('rounded-xl p-4', item.bg)}>
                <p className="text-xs text-gray-500 font-medium">{item.label}</p>
                <p className={clsx('text-xl font-black mt-1', item.color)}>
                  KES {item.value.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Cashier</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Revenue</th>
                {isOwner && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Profit</th>}
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Payment</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.recentSales.map((sale: any) => {
                if (!sale?.id) return null

                // Calculate per-sale profit
                let saleProfit = 0
                if (isOwner) {
                  const saleRevenue = Number(sale.total_amount) || 0
                  let saleCost = 0
                  const saleItems: any[] = sale.sale_items || []
                  for (const item of saleItems) {
                    const bp = priceMap[item.product_id] ?? 0
                    saleCost += (Number(item.quantity) || 0) * bp
                  }
                  saleProfit = saleRevenue - saleCost
                }

                const pmts: any[]    = sale.sale_payments || []
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
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {sale.cashier?.full_name || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">
                      KES {(Number(sale.total_amount) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right">
                        <span className={clsx('font-bold text-sm',
                          saleProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {saleProfit >= 0 ? '+' : ''}KES {Math.abs(saleProfit).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                        </span>
                      </td>
                    )}
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