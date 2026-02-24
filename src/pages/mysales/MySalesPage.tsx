import { useState, useEffect, useCallback } from 'react'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuthStore } from '../../store/authStore'
import { useRegisterStore } from '../../store/registerStore'
import { supabase } from '../../lib/supabase'
import {
  Banknote, CreditCard, Smartphone, User, Search,
  RefreshCw, Printer, X, Loader2, CheckCircle,
  Clock, TrendingUp, Receipt, AlertCircle, ArrowDownCircle
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
  customer: { name: string } | null
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
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [showReprint, setShowReprint]   = useState(false)
  const [showCollect, setShowCollect]   = useState(false)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectNotes, setCollectNotes]   = useState('')
  const [isCollecting, setIsCollecting]   = useState(false)

  const fetchSales = useCallback(async () => {
    setIsLoading(true)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const isCrossBranch = profile?.role === 'owner' || profile?.role === 'accountant'

      let q = supabase
        .from('sales')
        .select(`
          id, created_at, total_amount, amount_paid, change_given, payment_method,
          cashier_id,
          customer:customers(name),
          cashier:profiles(full_name),
          sale_items(id, product_name, quantity, unit_price, total_price),
          sale_payments(method, amount)
        `)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })

      if (isCrossBranch) {
        // Owner/accountant: see ALL sales across branches (or their selected branch via RLS)
        // No cashier filter — they see everyone's sales
      } else {
        // Cashier/admin: only see their own sales, limited to their shift
        q = q.eq('cashier_id', profile?.id)
        if (openedAt) q = q.gte('created_at', openedAt)
      }

      const { data, error } = await q
      if (error) throw error
      setSales(data as Sale[] || [])
    } catch (err: any) {
      toast.error('Failed to load sales')
      console.error(err)
    } finally {
      setIsLoading(false)
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, openedAt])

  useEffect(() => { fetchSales() }, [fetchSales])

  // Real-time: refresh when new sales come in
  useRealtime(['sales', 'sale_payments'], fetchSales, [profile?.id])

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

  // Collect payment handler
  const handleCollect = async () => {
    if (!selectedSale?.customer) return
    const amount = parseFloat(collectAmount)
    if (!amount || amount <= 0) { toast.error('Enter valid amount'); return }

    setIsCollecting(true)
    try {
      // Insert payment record
      await supabase.from('customer_payments').insert({
        customer_id: (selectedSale as any).customer_id,
        amount,
        notes: collectNotes || `Payment for sale #${selectedSale.id.slice(0,8).toUpperCase()}`,
        cashier_id: profile?.id,
      })

      // Reduce outstanding balance
      const { data: cust } = await supabase
        .from('customers').select('outstanding_balance').eq('name', selectedSale.customer.name).single()
      if (cust) {
        await supabase.from('customers')
          .update({ outstanding_balance: Math.max(0, cust.outstanding_balance - amount) })
          .eq('name', selectedSale.customer.name)
      }

      toast.success(`KES ${amount.toLocaleString()} collected from ${selectedSale.customer.name}`)
      setShowCollect(false)
      setCollectAmount('')
      setCollectNotes('')
      fetchSales()
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
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search customer name or receipt #" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white" />
        </div>
        <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white font-medium">
          <option value="all">All Methods</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="mobile_money">M-Pesa</option>
          <option value="credit">Credit</option>
        </select>
      </div>

      {/* Sales Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Count bar */}
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">
            {filtered.length} sale{filtered.length !== 1 ? 's' : ''} shown · Today's shift only
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cashier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Items</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Method</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
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
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(sale.created_at).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}
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
                    <td className="px-4 py-3 text-right">
                      <p className="font-bold text-gray-800">KES {sale.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setSelectedSale(sale); handlePrintReceipt(sale) }}
                          title="Print receipt"
                          className="w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition-colors">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {hasCredit && (
                          <button
                            onClick={() => {
                              setSelectedSale(sale)
                              setCollectAmount(sale.total_amount.toString())
                              setShowCollect(true)
                            }}
                            title="Collect debt"
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

      {/* Collect Debt Modal */}
      {showCollect && selectedSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">Collect Payment</h3>
                <p className="text-xs text-gray-400">Record cash received for credit sale</p>
              </div>
              <button onClick={() => { setShowCollect(false); setSelectedSale(null) }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <p className="text-xs text-orange-500 font-medium">Customer</p>
                <p className="font-bold text-orange-800">{selectedSale.customer?.name}</p>
                <p className="text-xs text-orange-500 mt-1">Sale: KES {selectedSale.total_amount.toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Amount to Collect (KES)</label>
                <input type="number" min="0" value={collectAmount} onChange={e => setCollectAmount(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-orange-300 rounded-xl text-xl font-bold outline-none focus:border-orange-500 text-right bg-orange-50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
                <input type="text" value={collectNotes} onChange={e => setCollectNotes(e.target.value)} placeholder="e.g. Partial payment"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowCollect(false); setSelectedSale(null) }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
                <button onClick={handleCollect} disabled={isCollecting || !collectAmount}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {isCollecting ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><CheckCircle className="w-4 h-4" />Record Payment</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}