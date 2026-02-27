import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart,
  Pie, Cell, Legend
} from 'recharts'
import {
  TrendingUp, ShoppingCart, Users, Package,
  Download, RefreshCw, Calendar, Building2,
  CreditCard, Banknote, Smartphone, DollarSign
} from 'lucide-react'
import { clsx } from 'clsx'
import Papa from 'papaparse'
import toast from 'react-hot-toast'

type DateRange = 'today' | 'week' | 'month' | 'year' | 'custom'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const paymentColors: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  card: 'bg-blue-100 text-blue-700',
  mobile_money: 'bg-purple-100 text-purple-700',
  credit: 'bg-orange-100 text-orange-700',
}

export default function ReportsPage() {
  const { profile } = useAuthStore()
  const isOwner = profile?.role === 'owner'

  // Date range
  const [range, setRange] = useState<DateRange>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [locations, setLocations] = useState<any[]>([])

  // Data
  const [isLoading, setIsLoading] = useState(true)
  const [salesByDay, setSalesByDay] = useState<any[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [cashierPerformance, setCashierPerformance] = useState<any[]>([])
  const [branchPerformance, setBranchPerformance] = useState<any[]>([])
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalTransactions: 0,
    averageTransaction: 0,
    totalItems: 0,
  })

  useEffect(() => {
    if (isOwner) fetchLocations()
  }, [])

  useEffect(() => { fetchAll() }, [range, customFrom, customTo, locationFilter])

  const fetchLocations = async () => {
    const { data } = await supabase.from('locations').select('id, name').eq('is_active', true)
    setLocations(data || [])
  }

  const getDateRange = () => {
    const now = new Date()
    let from: Date
    let to: Date = new Date()
    to.setHours(23, 59, 59, 999)

    switch (range) {
      case 'today':
        from = new Date(); from.setHours(0, 0, 0, 0)
        break
      case 'week':
        from = new Date(); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0)
        break
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'year':
        from = new Date(now.getFullYear(), 0, 1)
        break
      case 'custom':
        from = customFrom ? new Date(customFrom) : new Date()
        to = customTo ? new Date(customTo) : new Date()
        to.setHours(23, 59, 59, 999)
        break
      default:
        from = new Date(); from.setDate(now.getDate() - 6)
    }
    return { from: from.toISOString(), to: to.toISOString() }
  }

  const fetchAll = async () => {
    if (range === 'custom' && (!customFrom || !customTo)) return
    setIsLoading(true)
    try {
      await Promise.all([
        fetchSalesData(),
        fetchTopProducts(),
        fetchCashierPerformance(),
        isOwner && fetchBranchPerformance(),
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSalesData = async () => {
    const { from, to } = getDateRange()

    let q = supabase.from('sales')
      .select('total_amount, payment_method, created_at, cashier_id')
      .gte('created_at', from)
      .lte('created_at', to)

    if (!isOwner) q = q.eq('location_id', profile?.location_id)
    else if (locationFilter !== 'all') q = q.eq('location_id', locationFilter)

    const { data: sales } = await q

    if (!sales) return

    // Summary
    const totalSales = sales.reduce((s, sale) => s + sale.total_amount, 0)
    const totalTransactions = sales.length
    setSummary({
      totalSales,
      totalTransactions,
      averageTransaction: totalTransactions > 0 ? totalSales / totalTransactions : 0,
      totalItems: 0,
    })

    // Group by day
    const dayMap: Record<string, number> = {}
    const { from: fromDate, to: toDate } = getDateRange()
    const start = new Date(fromDate)
    const end = new Date(toDate)
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    for (let i = 0; i <= Math.min(diffDays, 365); i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = d.toLocaleDateString('en-KE', {
        month: 'short', day: 'numeric'
      })
      dayMap[key] = 0
    }

    sales.forEach(sale => {
      const key = new Date(sale.created_at).toLocaleDateString('en-KE', {
        month: 'short', day: 'numeric'
      })
      if (dayMap[key] !== undefined) dayMap[key] += sale.total_amount
    })

    setSalesByDay(Object.entries(dayMap).map(([date, total]) => ({ date, total })))

    // Payment breakdown
    const pmMap: Record<string, { total: number; count: number }> = {}
    sales.forEach(sale => {
      if (!pmMap[sale.payment_method]) pmMap[sale.payment_method] = { total: 0, count: 0 }
      pmMap[sale.payment_method].total += sale.total_amount
      pmMap[sale.payment_method].count += 1
    })
    setPaymentBreakdown(Object.entries(pmMap).map(([method, data]) => ({
      method,
      name: method.replace('_', ' '),
      ...data,
    })))
  }

  const fetchTopProducts = async () => {
    const { from, to } = getDateRange()

    let q = supabase.from('sale_items')
      .select('product_name, quantity, total_price, sale:sales!inner(created_at, location_id)')
      .gte('sale.created_at', from)
      .lte('sale.created_at', to)

    if (!isOwner) q = q.eq('sale.location_id', profile?.location_id)
    else if (locationFilter !== 'all') q = q.eq('sale.location_id', locationFilter)

    const { data } = await q

    const map: Record<string, { quantity: number; revenue: number }> = {}
    data?.forEach((item: any) => {
      if (!map[item.product_name]) map[item.product_name] = { quantity: 0, revenue: 0 }
      map[item.product_name].quantity += item.quantity
      map[item.product_name].revenue += item.total_price
    })

    setTopProducts(
      Object.entries(map)
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
    )
  }

  const fetchCashierPerformance = async () => {
    const { from, to } = getDateRange()

    let q = supabase.from('sales')
      .select('total_amount, cashier_id, cashier:profiles!inner(full_name)')
      .gte('created_at', from)
      .lte('created_at', to)

    if (!isOwner) q = q.eq('location_id', profile?.location_id)
    else if (locationFilter !== 'all') q = q.eq('location_id', locationFilter)

    const { data } = await q

    const map: Record<string, { name: string; total: number; count: number }> = {}
    data?.forEach((sale: any) => {
      const id = sale.cashier_id
      const name = sale.cashier?.full_name || 'Unknown'
      if (!map[id]) map[id] = { name, total: 0, count: 0 }
      map[id].total += sale.total_amount
      map[id].count += 1
    })

    setCashierPerformance(
      Object.values(map)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
    )
  }

  const fetchBranchPerformance = async () => {
    const { from, to } = getDateRange()

    const { data: locs } = await supabase
      .from('locations').select('id, name').eq('is_active', true)

    if (!locs) return

    const results = await Promise.all(
      locs.map(async loc => {
        const { data } = await supabase
          .from('sales')
          .select('total_amount')
          .eq('location_id', loc.id)
          .gte('created_at', from)
          .lte('created_at', to)

        return {
          name: loc.name,
          total: data?.reduce((s, sale) => s + sale.total_amount, 0) || 0,
          transactions: data?.length || 0,
        }
      })
    )

    setBranchPerformance(results.sort((a, b) => b.total - a.total))
  }

  const handleExport = () => {
    const rows = salesByDay.map(d => ({
      date: d.date,
      total_sales: d.total,
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales_report_${range}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report exported!')
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency', currency: 'KES', maximumFractionDigits: 0
    }).format(n)

  const rangeButtons: { id: DateRange; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: '7 Days' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
    { id: 'custom', label: 'Custom' },
  ]

  return (
    <div className="space-y-5">

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">

          {/* Range selector */}
          <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
            {rangeButtons.map(btn => (
              <button key={btn.id} onClick={() => setRange(btn.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  range === btn.id
                    ? 'bg-white text-blue-600 shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                )}>
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {/* Custom date range */}
            {range === 'custom' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <input type="date" value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="text-sm outline-none text-gray-700"
                    aria-label="Select start date" />
                </div>
                <span className="text-gray-400 text-sm">to</span>
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <input type="date" value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="text-sm outline-none text-gray-700"
                    aria-label="Select end date" />
                </div>
              </div>
            )}

            {/* Branch filter (owner only) */}
            {isOwner && (
              <select value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl 
                  text-sm outline-none focus:border-blue-400 text-gray-700" 
                aria-label="Select branch filter">
                <option value="all">All Branches</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            )}

            <button onClick={fetchAll}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 
                text-gray-500 rounded-xl hover:bg-gray-50 text-sm transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>

            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 
                text-white rounded-xl text-sm font-semibold transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Revenue', value: fmt(summary.totalSales),
            icon: TrendingUp, color: 'bg-blue-600',
            sub: 'Gross sales in period'
          },
          {
            label: 'Transactions', value: summary.totalTransactions,
            icon: ShoppingCart, color: 'bg-green-600',
            sub: 'Sales completed'
          },
          {
            label: 'Avg. Transaction', value: fmt(summary.averageTransaction),
            icon: DollarSign, color: 'bg-purple-600',
            sub: 'Per sale average'
          },
          {
            label: 'Top Cashier', value: cashierPerformance[0]?.name?.split(' ')[0] || '—',
            icon: Users, color: 'bg-orange-500',
            sub: cashierPerformance[0] ? fmt(cashierPerformance[0].total) : 'No data yet'
          },
        ].map(card => (
          <div key={card.label}
            className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1 truncate">{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center shrink-0 ml-2`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Sales Over Time Chart ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-bold text-gray-800">Sales Over Time</h4>
            <p className="text-xs text-gray-400">Revenue trend for selected period</p>
          </div>
          <div className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
            {fmt(summary.totalSales)} total
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
        ) : salesByDay.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-300">
            <div className="text-center">
              <TrendingUp className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">No sales data for this period</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={salesByDay}>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: unknown) => [fmt(v as number), 'Revenue']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5}
                fill="url(#gradient)" dot={{ fill: '#3b82f6', r: 3 }}
                activeDot={{ r: 5, fill: '#2563eb' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Payment Breakdown + Top Products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Payment Methods */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h4 className="font-bold text-gray-800 mb-1">Payment Methods</h4>
          <p className="text-xs text-gray-400 mb-4">Breakdown by payment type</p>

          {paymentBreakdown.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300">
              <div className="text-center">
                <CreditCard className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">No payment data</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentBreakdown} cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    dataKey="total" nameKey="name">
                    {paymentBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => [fmt(v as number), 'Revenue']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Legend
                    formatter={value => (
                      <span className="text-xs text-gray-600 capitalize">
                        {value.replace('_', ' ')}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2">
                {paymentBreakdown.map((pm, i) => {
                  const pct = summary.totalSales > 0
                    ? Math.round((pm.total / summary.totalSales) * 100) : 0
                  return (
                    <div key={pm.method}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            'text-xs px-2 py-0.5 rounded-full font-medium capitalize',
                            paymentColors[pm.method] || 'bg-gray-100 text-gray-600'
                          )}>
                            {pm.method.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-gray-400">{pm.count} sales</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-gray-700">{fmt(pm.total)}</span>
                          <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h4 className="font-bold text-gray-800 mb-1">Top Products</h4>
          <p className="text-xs text-gray-400 mb-4">Best sellers by revenue</p>

          {topProducts.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300">
              <div className="text-center">
                <Package className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">No product data</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topProducts.slice(0, 7).map((product, i) => {
                const maxRevenue = topProducts[0]?.revenue || 1
                const pct = Math.round((product.revenue / maxRevenue) * 100)
                return (
                  <div key={product.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 bg-blue-100 text-blue-700 text-xs font-bold 
                          rounded-full flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-700 truncate">
                          {product.name}
                        </span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-bold text-gray-800">{fmt(product.revenue)}</p>
                        <p className="text-xs text-gray-400">{product.quantity} units</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Cashier Performance ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-bold text-gray-800">Cashier Performance</h4>
            <p className="text-xs text-gray-400">Sales by staff member for selected period</p>
          </div>
        </div>

        {cashierPerformance.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-gray-300">
            <div className="text-center">
              <Users className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">No cashier data</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {cashierPerformance.map((cashier, i) => {
              const maxTotal = cashierPerformance[0]?.total || 1
              const pct = Math.round((cashier.total / maxTotal) * 100)
              return (
                <div key={cashier.name}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center 
                    text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                    {cashier.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{cashier.name}</p>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-bold text-gray-800">{fmt(cashier.total)}</p>
                        <p className="text-xs text-gray-400">{cashier.count} sales</p>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}>
                      </div>
                    </div>
                  </div>
                  {i === 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 font-bold 
                      px-2 py-0.5 rounded-full shrink-0">
                      🏆 Top
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Branch Comparison (Owner only) ── */}
      {isOwner && branchPerformance.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-blue-500" />
            <div>
              <h4 className="font-bold text-gray-800">Branch Comparison</h4>
              <p className="text-xs text-gray-400">Performance across all locations</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={branchPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: unknown) => [fmt(v as number), 'Revenue']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {branchPerformance.map((branch, i) => (
              <div key={branch.name}
                className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <p className="text-xs font-semibold text-gray-700 truncate">{branch.name}</p>
                </div>
                <p className="text-lg font-black text-blue-600">{fmt(branch.total)}</p>
                <p className="text-xs text-gray-400">{branch.transactions} transactions</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}