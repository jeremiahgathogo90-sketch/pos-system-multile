import { useState, useEffect, useCallback } from 'react'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuthStore } from '../../store/authStore'
import { useRegisterStore } from '../../store/registerStore'
import { supabase } from '../../lib/supabase'
import {
  Banknote, CreditCard, Smartphone, User, Search,
  RefreshCw, Printer, X, Loader2, CheckCircle,
  Clock, TrendingUp, Receipt, AlertCircle, ArrowDownCircle, Calendar,
  DollarSign, AlertTriangle
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// Payment method config
const pmConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  cash:         { label: 'Cash',   color: 'text-green-700',  bg: 'bg-green-100',  icon: Banknote  },
  card:         { label: 'Card',   color: 'text-blue-700',   bg: 'bg-blue-100',   icon: CreditCard },
  mobile_money: { label: 'M-Pesa', color: 'text-purple-700', bg: 'bg-purple-100', icon: Smartphone },
  credit:       { label: 'Credit', color: 'text-orange-700', bg: 'bg-orange-100', icon: User      },
  split:        { label: 'Split',  color: 'text-gray-700',   bg: 'bg-gray-100',   icon: TrendingUp },
}

function PaymentBadge({ method }: { method: string }) {
  const cfg = pmConfig[method] || { label: method, color: 'text-gray-700', bg: 'bg-gray-100', icon: Banknote }
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.bg, cfg.color)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  )
}

// Renders payment badges for a sale — uses sale_payments if available, else falls back to payment_method
function SalePaymentBadges({ sale }: { sale: any }) {
  const payments: any[] = sale.sale_payments || []

  if (payments.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {payments.map((p: any, i: number) => (
          <PaymentBadge key={i} method={p.method} />
        ))}
      </div>
    )
  }

  // Fallback: single method from sale record
  return <PaymentBadge method={sale.payment_method || 'cash'} />
}

interface Sale {
  id: string
  created_at: string
  discount_amount: number
  customer_id: string | null
  location_id: string | null
  customer: { id: string; name: string; outstanding_balance: number } | null
  cashier: { full_name: string } | null
  payment_method: string
  total_amount: number
  amount_paid: number
  change_given: number
  sale_items: { id: string; product_name: string; quantity: number; unit_price: number; total_price: number }[]
  sale_payments: { method: string; amount: number }[]
}

export default function MySalesPage() {
  const { profile } = useAuthStore()
  const { isOpen, openingAmount, openedAt } = useRegisterStore()

  const [sales, setSales]               = useState<Sale[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [search, setSearch]             = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [dateRange, setDateRange]         = useState<'today'|'week'|'month'|'all'>('today')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [showReprint, setShowReprint]   = useState(false)
  const [showCollect, setShowCollect]   = useState(false)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectNotes, setCollectNotes]   = useState('')
  const [isCollecting, setIsCollecting]   = useState(false)
  const [customerBalance, setCustomerBalance] = useState(0)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)

  const fetchSales = useCallback(async () => {
    setIsLoading(true)
    try {
      const isCrossBranch = profile?.role === 'owner' || profile?.role === 'accountant'

      // ── Compute start date based on dateRange ──
      let startDate: string | null = null
      const now = new Date()
      if (dateRange === 'today') {
        const d = new Date(now); d.setHours(0, 0, 0, 0)
        startDate = d.toISOString()
      } else if (dateRange === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0)
        startDate = d.toISOString()
      } else if (dateRange === 'month') {
        const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0)
        startDate = d.toISOString()
      }
      // 'all' => startDate stays null — no date filter

      let q = supabase
        .from('sales')
        .select(`
          id, created_at, total_amount, discount_amount, amount_paid, change_given, payment_method,
          cashier_id, customer_id, location_id,
          customer:customers(id, name, outstanding_balance),
          cashier:profiles(full_name),
          sale_items(id, product_name, quantity, unit_price, total_price),
          sale_payments(method, amount)
        `)
        .order('created_at', { ascending: false })
        .limit(500)

      if (startDate) q = q.gte('created_at', startDate)

      if (isCrossBranch) {
        // Owner/accountant: see all sales (RLS handles branch filtering)
      } else {
        // Cashier/admin: only own sales
        q = q.eq('cashier_id', profile?.id)
      }

      const { data, error } = await q
      if (error) throw error
      setSales(data as unknown as Sale[] || [])
    } catch (err: any) {
      toast.error('Failed to load sales')
      console.error(err)
    } finally {
      setIsLoading(false)
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, dateRange])

  useEffect(() => { fetchSales() }, [fetchSales])
  useEffect(() => { fetchSales() }, [dateRange])

  // Real-time: refresh when new sales come in
  useRealtime(['sales', 'sale_payments'], fetchSales, [profile?.id])


  // Fetch the customer's TOTAL outstanding balance (all sales combined)
  const fetchCustomerBalance = async (customerId: string) => {
    setIsLoadingBalance(true)
    try {
      const { data } = await supabase
        .from('customers')
        .select('outstanding_balance')
        .eq('id', customerId)
        .single()
      const balance = data?.outstanding_balance || 0
      setCustomerBalance(balance)
      setCollectAmount(balance.toString())
    } catch {
      setCustomerBalance(0)
    } finally {
      setIsLoadingBalance(false)
    }
  }

  // Compute summary totals
  const summary = sales.reduce((acc, sale) => {
    const pmts = sale.sale_payments || []
    if (pmts.length > 0) {
      pmts.forEach(p => {
        if (p.method === 'cash')         acc.cash   += p.amount
        if (p.method === 'card')         acc.card   += p.amount
        if (p.method === 'mobile_money') acc.mpesa  += p.amount
        if (p.method === 'credit')       acc.credit += p.amount
      })
    } else {
      // Fallback: whole sale under one method
      if (sale.payment_method === 'cash')         acc.cash   += sale.total_amount
      if (sale.payment_method === 'card')         acc.card   += sale.total_amount
      if (sale.payment_method === 'mobile_money') acc.mpesa  += sale.total_amount
      if (sale.payment_method === 'credit')       acc.credit += sale.total_amount
    }
    acc.total += sale.total_amount
    return acc
  }, { cash: 0, card: 0, mpesa: 0, credit: 0, total: 0 })

  const expectedInTill = openingAmount + summary.cash

  // Filter
  const filtered = sales.filter(sale => {
    const search_lower = search.toLowerCase()
    const matchSearch  = !search
      || (sale.customer?.name || 'Walk-In').toLowerCase().includes(search_lower)
      || sale.id.toLowerCase().includes(search_lower)

    const matchMethod = filterMethod === 'all'
      || (sale.sale_payments || []).some((p: any) => p.method === filterMethod)
      || (sale.payment_method === filterMethod)

    return matchSearch && matchMethod
  })

  // Collect payment handler — works on customer TOTAL debt, not single sale
  const handleCollect = async () => {
    if (!selectedSale?.customer_id || !selectedSale?.customer) return
    const amount = parseFloat(collectAmount)
    if (!amount || amount <= 0)       { toast.error('Enter a valid amount'); return }
    if (amount > customerBalance)     { toast.error(`Amount exceeds total balance of KES ${customerBalance.toLocaleString()}`); return }

    setIsCollecting(true)
    try {
      // 1. Record the payment
      // location_id is NOT NULL — use the sale's branch or fallback to cashier's branch
      const locationId = selectedSale.location_id || profile?.location_id
      if (!locationId) { toast.error('Cannot determine branch location'); return }

      const { error: payErr } = await supabase.from('customer_payments').insert({
        customer_id: selectedSale.customer_id,
        location_id: locationId,
        amount,
        notes: collectNotes || `Payment collected — ${selectedSale.customer.name}`,
      })
      if (payErr) throw payErr

      // 2. Deduct from customer's outstanding_balance using customer ID (not name)
      const newBalance = Math.max(0, customerBalance - amount)
      const { error: updErr } = await supabase
        .from('customers')
        .update({ outstanding_balance: newBalance })
        .eq('id', selectedSale.customer_id)
      if (updErr) throw updErr

      toast.success(
        `✓ KES ${amount.toLocaleString()} collected from ${selectedSale.customer.name}` +
        (newBalance > 0 ? ` · KES ${newBalance.toLocaleString()} still owing` : ' · Balance cleared!')
      )

      // 3. Close & reset
      setShowCollect(false)
      setSelectedSale(null)
      setCollectAmount('')
      setCollectNotes('')
      setCustomerBalance(0)

      // 4. Immediately refresh so all rows update
      await fetchSales()

    } catch (err: any) {
      toast.error(err.message || 'Failed to collect payment')
    } finally {
      setIsCollecting(false)
    }
  }

  // Escape HTML to prevent XSS in print window
  const esc = (str: string) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

  const handlePrintReceipt = (sale: Sale) => {
    const pmts = sale.sale_payments?.length > 0
      ? sale.sale_payments.map(p => `${esc(pmConfig[p.method]?.label || p.method)}: KES ${p.amount.toLocaleString()}`).join('\n')
      : `${esc(pmConfig[sale.payment_method]?.label || sale.payment_method)}: KES ${sale.total_amount.toLocaleString()}`

    const items = sale.sale_items.map(i =>
      `${esc(i.product_name)}\n  ${i.quantity} × ${i.unit_price.toLocaleString()} = ${i.total_price.toLocaleString()}`
    ).join('\n')

    const w = window.open('', '_blank', 'width=400,height=700')
    if (!w) { toast.error('Allow popups to print'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt Reprint</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:4mm}pre{font-family:inherit;white-space:pre-wrap}.c{text-align:center}.b{font-weight:bold}.dash{border-top:1px dashed #555;margin:5px 0}@media print{body{width:80mm}@page{margin:0;size:80mm auto}}</style>
    </head><body>
    <div class="c b" style="font-size:15px">My Shop</div>
    <div class="c">*** REPRINT ***</div>
    <div class="dash"></div>
    <div>Date: ${new Date(sale.created_at).toLocaleString('en-KE')}</div>
    <div>Receipt#: ${sale.id.slice(0,8).toUpperCase()}</div>
    <div>Customer: ${esc(sale.customer?.name || 'Walk-In')}</div>
    <div class="dash"></div>
    <div class="b">ITEMS</div>
    <pre>${items}</pre>
    <div class="dash"></div>
    <div style="font-size:14px;font-weight:bold;display:flex;justify-content:space-between"><span>TOTAL</span><span>KES ${sale.total_amount.toLocaleString()}</span></div>
    <div class="dash"></div>
    <div class="b">PAYMENT</div>
    <pre>${pmts}</pre>
    <div class="dash"></div>
    <div class="c">Thank you!</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-800">
            {profile?.role === 'owner' || profile?.role === 'accountant' ? 'All Sales' : 'My Sales'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {profile?.role === 'owner' || profile?.role === 'accountant'
              ? "Today's sales across all cashiers"
              : isOpen
                ? `Today's shift · Started ${openedAt ? new Date(openedAt).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' }) : '—'}`
                : 'No active shift'
            }
          </p>
        </div>
        <button onClick={fetchSales} disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />Refresh
        </button>
      </div>

      {/* Register status */}
      {isOpen ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-green-800">Register Open</span>
            <span className="text-sm text-green-600">· Float: KES {openingAmount.toLocaleString()}</span>
          </div>
          <div className="text-sm text-green-700 font-medium">
            Expected in till: <strong>KES {expectedInTill.toLocaleString()}</strong>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-600" />
          <span className="text-sm font-semibold text-yellow-800">No active shift — showing today's sales only</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Cash Sales',   value: summary.cash,   icon: Banknote,   colors: 'bg-green-50 border-green-200',  text: 'text-green-700'  },
          { label: 'Card Sales',   value: summary.card,   icon: CreditCard, colors: 'bg-blue-50 border-blue-200',    text: 'text-blue-700'   },
          { label: 'M-Pesa Sales', value: summary.mpesa,  icon: Smartphone, colors: 'bg-purple-50 border-purple-200',text: 'text-purple-700' },
          { label: 'Credit Sales', value: summary.credit, icon: User,       colors: 'bg-orange-50 border-orange-200',text: 'text-orange-700' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className={clsx('border rounded-xl p-4', card.colors)}>
              <div className="flex items-center justify-between mb-2">
                <p className={clsx('text-sm font-semibold', card.text)}>{card.label}</p>
                <Icon className={clsx('w-5 h-5', card.text)} />
              </div>
              <p className={clsx('text-2xl font-black', card.text)}>KES {card.value.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</p>
            </div>
          )
        })}
      </div>

      {/* Grand Total Bar */}
      <div className="bg-gray-800 text-white rounded-xl px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">Total Sales</p>
          <p className="text-3xl font-black">KES {summary.total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">{sales.length} transaction{sales.length !== 1 ? 's' : ''}</p>
          {sales.length > 0 && <p className="text-gray-300 text-sm">Avg: KES {(summary.total / sales.length).toLocaleString('en-KE', { maximumFractionDigits: 0 })}</p>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Date range pills */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          {([
            { key: 'today',  label: 'Today' },
            { key: 'week',   label: 'Last 7 Days' },
            { key: 'month',  label: 'This Month' },
            { key: 'all',    label: 'All Time' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setDateRange(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                dateRange === opt.key
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        {/* Search + method filter */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search customer name or receipt #" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white" />
          </div>
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white font-medium"          aria-label="Filter sales by payment method">
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile_money">M-Pesa</option>
            <option value="credit">Credit</option>
          </select>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Count bar */}
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">
            {filtered.length} sale{filtered.length !== 1 ? 's' : ''} shown ·{' '}
            <span className="font-semibold text-blue-600">
              {dateRange === 'today' ? "Today" : dateRange === 'week' ? 'Last 7 days' : dateRange === 'month' ? 'This month' : 'All time'}
            </span>
          </span>
          <span className="text-xs text-gray-400">
            Total: <strong className="text-gray-700">KES {filtered.reduce((s, sale) => s + sale.total_amount, 0).toLocaleString()}</strong>
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
            <p className="text-sm text-gray-400 mt-2">Loading sales...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="w-12 h-12 mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-400">No sales found</p>
            <p className="text-xs text-gray-300 mt-1">{search ? 'Try a different search' : 'Make a sale to see it here'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date & Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cashier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Items</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Method</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Discount</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Balance Due</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(sale => {
                const hasCredit = (sale.sale_payments || []).some((p: any) => p.method === 'credit')
                  || sale.payment_method === 'credit'
                const itemCount = sale.sale_items?.length || 0
                return (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-700">
                        {new Date(sale.created_at).toLocaleDateString('en-KE', { day:'2-digit', month:'short', year:'numeric' })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(sale.created_at).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg font-semibold">
                        #{sale.id.slice(0,8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">
                        {sale.customer?.name || <span className="text-gray-400 font-normal">Walk-In</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600 font-medium">
                        {sale.cashier?.full_name || <span className="text-gray-300">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {itemCount > 0
                        ? <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">{itemCount}</span>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <SalePaymentBadges sale={sale} />
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {sale.discount_amount > 0
                        ? <span className="text-orange-600 font-semibold text-sm">-KES {sale.discount_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-bold text-gray-800">KES {sale.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {(() => {
                        // Credit portion of this specific sale
                        const creditPortion = (sale.sale_payments || [])
                          .filter((p: any) => p.method === 'credit')
                          .reduce((s: number, p: any) => s + p.amount, 0)
                        const fallbackCredit = sale.payment_method === 'credit' ? sale.total_amount : 0
                        const due = creditPortion || fallbackCredit

                        if (due <= 0) {
                          // No credit on this sale — fully paid
                          return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold"><CheckCircle className="w-3 h-3" />Paid</span>
                        }

                        // Has credit — check if customer has cleared their total balance
                        const customerOwing = sale.customer?.outstanding_balance ?? due
                        if (customerOwing <= 0) {
                          // Customer paid off everything (may span multiple sales)
                          return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold"><CheckCircle className="w-3 h-3" />Paid</span>
                        }

                        // Still owes money
                        return (
                          <span className="text-red-600 font-bold text-sm">
                            KES {customerOwing.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setSelectedSale(sale); handlePrintReceipt(sale) }}
                          title="Print receipt"
                          className="w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition-colors">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {hasCredit && sale.customer_id && (sale.customer?.outstanding_balance ?? 1) > 0 && (
                          <button
                            onClick={() => {
                              setSelectedSale(sale)
                              setShowCollect(true)
                              fetchCustomerBalance(sale.customer_id!)
                            }}
                            title="Collect total customer debt"
                            className="w-8 h-8 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center transition-colors">
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Collect Debt Modal — shows customer TOTAL balance, not single sale */}
      {showCollect && selectedSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">Collect Payment</h3>
                <p className="text-xs text-gray-400">Clear customer outstanding balance</p>
              </div>
              <button onClick={() => { setShowCollect(false); setSelectedSale(null); setCustomerBalance(0) }} className="p-1 rounded hover:bg-gray-100 transition-colors" aria-label="Close collect payment modal">
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Customer info + TOTAL balance */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-red-500 font-semibold uppercase tracking-wide">Customer</p>
                    <p className="font-black text-red-800 text-lg mt-0.5">{selectedSale.customer?.name}</p>
                  </div>
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-red-600" />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-red-200">
                  <p className="text-xs text-red-500 font-medium">Total Outstanding Balance</p>
                  {isLoadingBalance ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      <span className="text-sm text-red-400">Loading balance...</span>
                    </div>
                  ) : (
                    <p className="text-2xl font-black text-red-700 mt-0.5">
                      KES {customerBalance.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  <p className="text-xs text-red-400 mt-1">
                    Cumulative debt across all credit sales
                  </p>
                </div>
              </div>

              {/* This sale reference */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-500">Selected sale</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-semibold">
                    #{selectedSale.id.slice(0,8).toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold text-gray-700">
                    KES {selectedSale.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Amount to collect */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">Amount to Collect (KES)</label>
                  {customerBalance > 0 && (
                    <button
                      onClick={() => setCollectAmount(customerBalance.toString())}
                      className="text-xs text-orange-600 font-semibold hover:underline">
                      Full balance
                    </button>
                  )}
                </div>
                <input
                  type="number" min="0" max={customerBalance}
                  value={collectAmount}
                  onChange={e => setCollectAmount(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-orange-300 rounded-xl text-2xl font-black outline-none focus:border-orange-500 text-right bg-orange-50 text-orange-800"
                  aria-label="Enter amount to collect"
                />
                {/* Remaining balance preview */}
                {collectAmount && parseFloat(collectAmount) > 0 && (
                  <div className={clsx(
                    'mt-2 flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold',
                    parseFloat(collectAmount) >= customerBalance
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-orange-50 border border-orange-200 text-orange-700'
                  )}>
                    <span>
                      {parseFloat(collectAmount) >= customerBalance ? '✓ Balance fully cleared' : 'Remaining after payment'}
                    </span>
                    {parseFloat(collectAmount) < customerBalance && (
                      <span className="font-black">
                        KES {Math.max(0, customerBalance - parseFloat(collectAmount)).toLocaleString('en-KE', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                )}
                {parseFloat(collectAmount) > customerBalance && customerBalance > 0 && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-xs text-red-600 font-semibold">Amount exceeds total balance</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
                <input
                  type="text" value={collectNotes}
                  onChange={e => setCollectNotes(e.target.value)}
                  placeholder="e.g. Partial payment, cash received..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 bg-gray-50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowCollect(false); setSelectedSale(null); setCustomerBalance(0) }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleCollect}
                  disabled={isCollecting || !collectAmount || parseFloat(collectAmount) <= 0 || parseFloat(collectAmount) > customerBalance || isLoadingBalance}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isCollecting
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Recording...</>
                    : <><DollarSign className="w-4 h-4" />Record Payment</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}