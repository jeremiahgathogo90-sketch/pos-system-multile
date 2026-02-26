import { useState, useEffect, useRef } from 'react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { useRegisterStore } from '../../store/registerStore'
import { supabase } from '../../lib/supabase'
import {
  Search, User, UserPlus, Package, Plus, Minus,
  Clock, Eye, Layers, X, Lock, Unlock,
  Banknote, Smartphone, History, Receipt, ChevronDown,
  Phone, Loader2, Printer, CheckCircle, AlertCircle,
  CreditCard, TrendingUp
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { Customer, Product, Category } from '../../types/database'

const paymentMethods = [
  { id: 'cash',         label: 'Cash',   icon: Banknote,   light: 'bg-green-50 border-green-300 text-green-800'    },
  { id: 'card',         label: 'Card',   icon: CreditCard, light: 'bg-blue-50 border-blue-300 text-blue-800'       },
  { id: 'mobile_money', label: 'M-Pesa', icon: Smartphone, light: 'bg-purple-50 border-purple-300 text-purple-800' },
  { id: 'credit',       label: 'Credit', icon: User,       light: 'bg-orange-50 border-orange-300 text-orange-800' },
]

interface SplitPaymentEntry { id: string; method: string; amount: number }

// ── Autocomplete Dropdown ────────────────────────────────
// Reusable — renders a floating list below an input
function AutocompleteDropdown({ items, onSelect, renderItem, emptyText }: {
  items: any[]
  onSelect: (item: any) => void
  renderItem: (item: any) => React.ReactNode
  emptyText?: string
}) {
  if (items.length === 0 && !emptyText) return null
  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
      {items.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-400 text-center">{emptyText}</div>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id || i}
            onMouseDown={e => { e.preventDefault(); onSelect(item) }}
            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors">
            {renderItem(item)}
          </button>
        ))
      )}
    </div>
  )
}

// ── Register Modal ───────────────────────────────────────
interface ShiftSummary {
  cashierName: string
  branchName: string
  openedAt: string
  closedAt: string
  closingAmount: number
  cash: number
  card: number
  mpesa: number
  credit: number
  total: number
  count: number
  expected: number
  variance: number
  openingAmount: number
}

function RegisterModal({ mode, onComplete }: { mode: 'open' | 'close'; onComplete: () => void }) {
  const { profile } = useAuthStore()
  const { registerId, openingAmount, openedAt, setRegister, closeRegister } = useRegisterStore()
  const [amount, setAmount]         = useState('')
  const [notes, setNotes]           = useState('')
  const [isLoading, setIsLoading]   = useState(false)
  const [sessionSummary, setSS]     = useState<any>(null)
  const [fetchingSS, setFetchingSS] = useState(false)
  // When this is set the modal switches to summary view — no unmount/remount needed
  const [shiftDone, setShiftDone]   = useState<ShiftSummary | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (mode === 'close') fetchSS() }, [mode])

  const fetchSS = async () => {
    if (!registerId) return
    setFetchingSS(true)
    try {
      const { data: sales } = await supabase
        .from('sales').select('total_amount, payment_method')
        .eq('cashier_id', profile?.id)
        .gte('created_at', openedAt || new Date().toISOString())
      if (sales) {
        const cash   = sales.filter(s => s.payment_method === 'cash').reduce((t, s) => t + s.total_amount, 0)
        const card   = sales.filter(s => s.payment_method === 'card').reduce((t, s) => t + s.total_amount, 0)
        const mpesa  = sales.filter(s => s.payment_method === 'mobile_money').reduce((t, s) => t + s.total_amount, 0)
        const credit = sales.filter(s => s.payment_method === 'credit').reduce((t, s) => t + s.total_amount, 0)
        const total  = sales.reduce((t, s) => t + s.total_amount, 0)
        setSS({ cash, card, mpesa, credit, total, count: sales.length, expected: openingAmount + cash })
      }
    } finally { setFetchingSS(false) }
  }

  const handleOpen = async () => {
    const float = parseFloat(amount) || 0
    setIsLoading(true)
    try {
      const { data, error } = await supabase.from('cash_registers').insert({
        location_id: profile?.location_id, cashier_id: profile?.id,
        opening_amount: float, status: 'open', opened_at: new Date().toISOString(), notes: notes || null,
      }).select().single()
      if (error) throw error
      setRegister(data.id, float, data.opened_at)
      toast.success(`Register opened · Float KES ${float.toLocaleString()}`)
      onComplete()
    } catch (err: any) {
      toast.error(err.message || 'Failed to open register')
    } finally { setIsLoading(false) }
  }

  const handleClose = async () => {
    const closing = parseFloat(amount) || 0
    setIsLoading(true)
    try {
      const closedAt = new Date().toISOString()
      const { error } = await supabase.from('cash_registers').update({
        closing_amount: closing, expected_amount: sessionSummary?.expected || 0,
        cash_sales: sessionSummary?.cash || 0, card_sales: sessionSummary?.card || 0,
        mpesa_sales: sessionSummary?.mpesa || 0, credit_sales: sessionSummary?.credit || 0,
        total_sales: sessionSummary?.total || 0, transaction_count: sessionSummary?.count || 0,
        status: 'closed', closed_at: closedAt, notes: notes || null,
      }).eq('id', registerId)
      if (error) throw error

      const ss = sessionSummary
      const summaryData: ShiftSummary = {
        cashierName: profile?.full_name || 'Unknown',
        branchName:  profile?.location?.name || 'Main Branch',
        openedAt:    openedAt || closedAt,
        closedAt,
        closingAmount: closing,
        openingAmount,
        cash:     ss?.cash   || 0,
        card:     ss?.card   || 0,
        mpesa:    ss?.mpesa  || 0,
        credit:   ss?.credit || 0,
        total:    ss?.total  || 0,
        count:    ss?.count  || 0,
        expected: ss?.expected || 0,
        variance: closing - (ss?.expected || 0),
      }

      // Don't call closeRegister() yet — if we do, !registerIsOpen fires immediately
      // and POSPage re-renders to the open-register screen before shiftDone renders.
      // closeRegister() is called below when user dismisses the summary.
      toast.success('Register closed. Shift ended!')
      setShiftDone(summaryData)
    } catch (err: any) {
      toast.error(err.message || 'Failed to close register')
    } finally { setIsLoading(false) }
  }

  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML
    if (!printContent) return
    const w = window.open('', '_blank', 'width=420,height=750')
    if (!w) { toast.error('Allow popups to print'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shift Summary</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:4mm}
      .c{text-align:center}.b{font-weight:bold}
      .dash{border-top:1px dashed #555;margin:6px 0}
      .solid{border-top:2px solid #000;margin:6px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0}
      @media print{body{width:80mm}@page{margin:0;size:80mm auto}}
    </style></head><body>
    ${printContent}
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},600)}<\/script>
    </body></html>`)
    w.document.close()
  }

  const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
  const variance = sessionSummary && amount ? (parseFloat(amount) || 0) - sessionSummary.expected : 0

  // ── SUMMARY VIEW (after shift is closed) ──────────────
  if (shiftDone) {
    const s = shiftDone
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[95vh]">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-black text-gray-800">Shift Closed</h3>
                <p className="text-xs text-gray-400">End of shift summary</p>
              </div>
            </div>
            <button onClick={onComplete}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-xs leading-relaxed">
              <div ref={printRef}>
                <div className="text-center font-bold text-sm mb-0.5">SHIFT SUMMARY</div>
                <div className="text-center text-gray-500 text-xs">{s.branchName}</div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Cashier</span><span className="font-semibold">{s.cashierName}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Branch</span><span className="font-semibold">{s.branchName}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Opened</span><span className="font-semibold">{new Date(s.openedAt).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Closed</span><span className="font-semibold">{new Date(s.closedAt).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="text-center font-bold text-xs text-gray-500 mb-1">SALES BREAKDOWN</div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Cash</span><span className="font-semibold text-green-700">{fmt(s.cash)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Card / Bank</span><span className="font-semibold text-blue-700">{fmt(s.card)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">M-Pesa</span><span className="font-semibold text-purple-700">{fmt(s.mpesa)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Credit</span><span className="font-semibold text-orange-700">{fmt(s.credit)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Transactions</span><span className="font-semibold">{s.count} sales</span></div>
                <div className="border-t-2 border-gray-800 my-2" />
                <div className="flex justify-between py-0.5 font-black text-sm"><span>TOTAL SALES</span><span>{fmt(s.total)}</span></div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="text-center font-bold text-xs text-gray-500 mb-1">CASH RECONCILIATION</div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Opening Float</span><span>{fmt(s.openingAmount)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">+ Cash Sales</span><span>{fmt(s.cash)}</span></div>
                <div className="flex justify-between py-0.5 font-semibold"><span>Expected in Till</span><span>{fmt(s.expected)}</span></div>
                <div className="flex justify-between py-0.5 font-semibold"><span>Actual Count</span><span>{fmt(s.closingAmount)}</span></div>
                <div className={`flex justify-between py-0.5 font-black text-sm mt-1 ${s.variance===0?'text-green-700':s.variance>0?'text-blue-700':'text-red-700'}`}>
                  <span>{s.variance===0?'✓ Balanced':s.variance>0?'↑ Overage':'↓ Shortage'}</span>
                  <span>{s.variance!==0?`${s.variance>0?'+':''}${fmt(Math.abs(s.variance))}`:''}</span>
                </div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="text-center text-gray-400 text-xs">{new Date().toLocaleString('en-KE')}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button onClick={onComplete}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">
              Close
            </button>
            <button onClick={handlePrint}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" />Print Summary
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'open') return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <Unlock className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-800">Open Register</h2>
            <p className="text-xs text-gray-400">Enter your cash float to start your shift</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-blue-800">Welcome, {profile?.full_name}!</p>
            <p className="text-xs text-blue-500 mt-0.5">Enter the cash amount in your register to begin your shift.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Opening Balance (Cash in Register)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">KES</span>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOpen()} placeholder="0.00" autoFocus
                className="w-full pl-12 pr-4 py-3 border-2 border-blue-400 rounded-xl text-xl font-bold outline-none focus:border-blue-600 text-right bg-gray-50" />
            </div>
            <p className="text-xs text-gray-400 mt-1">Count all cash in your drawer and enter the total amount</p>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[0,500,1000,2000,5000,10000,20000,50000].map(v => (
                <button key={v} onClick={() => setAmount(v.toString())}
                  className={clsx('py-1.5 rounded-lg text-xs font-semibold border transition-all',
                    parseFloat(amount) === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-blue-300 bg-white')}>
                  {v === 0 ? '0' : v >= 1000 ? `${v/1000}k` : v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Morning shift"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50" />
          </div>
          <button onClick={handleOpen} disabled={isLoading}
            className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 text-base">
            {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Opening...</> : <><Unlock className="w-5 h-5" />Open Register &amp; Start Shift</>}
          </button>
        </div>
      </div>
    </div>
  )

  // ── CLOSE REGISTER VIEW ───────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><Lock className="w-5 h-5 text-red-600" /></div>
          <div><h2 className="text-lg font-black text-gray-800">Close Register</h2><p className="text-xs text-gray-400">End of shift — cash reconciliation</p></div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600">Shift started</span></div>
            <span className="text-sm font-bold">{openedAt ? new Date(openedAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '—'}</span>
          </div>
          {fetchingSS ? <div className="py-6 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-blue-500" /></div>
            : sessionSummary && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[{l:'Cash',v:sessionSummary.cash,c:'bg-green-50 border-green-200 text-green-700'},{l:'Card',v:sessionSummary.card,c:'bg-blue-50 border-blue-200 text-blue-700'},{l:'M-Pesa',v:sessionSummary.mpesa,c:'bg-purple-50 border-purple-200 text-purple-700'},{l:'Credit',v:sessionSummary.credit,c:'bg-orange-50 border-orange-200 text-orange-700'}].map(item => (
                    <div key={item.l} className={clsx('border rounded-xl p-3',item.c)}>
                      <p className="text-xs font-semibold">{item.l}</p>
                      <p className="text-base font-black">KES {item.v.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-800 text-white rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-sm"><span className="text-gray-300">Opening Float</span><span className="font-bold">KES {openingAmount.toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-300">+ Cash Sales</span><span className="text-green-400 font-bold">KES {sessionSummary.cash.toLocaleString()}</span></div>
                  <div className="border-t border-gray-600 pt-1.5 flex justify-between"><span className="text-gray-200">Expected in Till</span><span className="text-yellow-400 font-black text-lg">KES {sessionSummary.expected.toLocaleString()}</span></div>
                  <div className="border-t border-gray-700 pt-1.5 flex justify-between text-xs"><span className="text-gray-400">{sessionSummary.count} transactions</span><span className="font-bold text-gray-200">KES {sessionSummary.total.toLocaleString()}</span></div>
                </div>
              </div>
            )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Actual Cash in Till (KES)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">KES</span>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Count your cash..."
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-xl text-xl font-bold outline-none focus:border-red-400 text-right bg-gray-50" />
            </div>
            {amount && sessionSummary && (
              <div className={clsx('mt-2 px-4 py-2.5 rounded-xl border-2 flex items-center justify-between',
                variance===0?'bg-green-50 border-green-300':variance>0?'bg-blue-50 border-blue-300':'bg-red-50 border-red-300')}>
                <div className="flex items-center gap-1.5">
                  {variance===0?<CheckCircle className="w-4 h-4 text-green-600"/>:<AlertCircle className={clsx('w-4 h-4',variance>0?'text-blue-600':'text-red-600')}/>}
                  <span className={clsx('text-sm font-bold',variance===0?'text-green-700':variance>0?'text-blue-700':'text-red-700')}>
                    {variance===0?'Balanced ✓':variance>0?'Overage':'Shortage'}
                  </span>
                </div>
                {variance!==0&&<span className={clsx('font-black',variance>0?'text-blue-700':'text-red-700')}>{variance>0?'+':''}KES {Math.abs(variance).toLocaleString()}</span>}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Handover notes..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50 resize-none"/>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={handleClose} disabled={isLoading||!amount}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {isLoading?<><Loader2 className="w-5 h-5 animate-spin"/>Closing...</>:<><Lock className="w-5 h-5"/>Close Register &amp; End Shift</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thermal Receipt ──────────────────────────────────────
interface ReceiptData {
  saleId:string;storeName:string;storeAddress:string;storePhone:string
  branchName:string;cashierName:string;date:string
  customer:string|null;taxRate:number
  items:{name:string;qty:number;price:number;total:number}[]
  subtotal:number;tax:number;discount:number;total:number
  payments:SplitPaymentEntry[];change:number
  receiptFooter:string
}

function ThermalReceipt({data,onClose}:{data:ReceiptData;onClose:()=>void}) {
  const receiptRef = useRef<HTMLDivElement>(null)
  const getLabel = (id:string) => paymentMethods.find(m=>m.id===id)?.label || id

  const handlePrint = () => {
    const content = receiptRef.current?.innerHTML
    if (!content) return
    const w = window.open('', '_blank', 'width=400,height=750')
    if (!w) { toast.error('Allow popups to print'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box }
      body { font-family:'Courier New',monospace; font-size:12px; width:80mm; margin:0 auto; padding:5mm }
      .center { text-align:center }
      .bold { font-weight:bold }
      .large { font-size:18px; font-weight:bold }
      .medium { font-size:14px }
      .small { font-size:10px; color:#555 }
      .dash { border-top:1px dashed #777; margin:6px 0 }
      .solid { border-top:2px solid #000; margin:6px 0 }
      .row { display:flex; justify-content:space-between; margin:3px 0; font-size:12px }
      .row-label { color:#333 }
      .thead { display:flex; justify-content:space-between; font-weight:bold; margin:3px 0; font-size:11px; border-bottom:1px solid #ccc; padding-bottom:3px }
      .thead .item-name { flex:2 }
      .thead .item-qty  { flex:0.5; text-align:center }
      .thead .item-price{ flex:1.2; text-align:right }
      .thead .item-total{ flex:1.2; text-align:right }
      .trow { display:flex; justify-content:space-between; margin:4px 0; font-size:12px }
      .trow .item-name  { flex:2; font-weight:bold }
      .trow .item-qty   { flex:0.5; text-align:center }
      .trow .item-price { flex:1.2; text-align:right }
      .trow .item-total { flex:1.2; text-align:right; font-weight:bold }
      .total-row { display:flex; justify-content:space-between; font-size:16px; font-weight:bold; margin:4px 0 }
      .payment-section { margin:4px 0 }
      .payment-label { font-weight:bold; font-size:12px; margin-bottom:3px }
      .payment-row { display:flex; justify-content:space-between; font-size:12px; margin:2px 0 }
      .footer-line { text-align:center; font-size:11px; margin:2px 0 }
      .receipt-id { text-align:center; font-size:11px; margin-top:4px; color:#444 }
      @media print { body{width:80mm} @page{margin:0;size:80mm auto} }
    </style>
    </head><body>
    ${content}
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},600)}<\/script>
    </body></html>`)
    w.document.close()
  }

  const fmt = (n:number) => `KES ${n.toLocaleString('en-KE',{minimumFractionDigits:2})}`
  const shortId = `SALE-${data.saleId.replace(/-/g,'').toUpperCase().slice(0,16)}`

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[92vh]">

        {/* Modal header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600"/>
            </div>
            <div>
              <p className="font-bold text-gray-800">Sale Complete!</p>
              <p className="text-xs text-gray-400">Receipt ready to print</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Receipt preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 font-mono text-xs shadow-inner">
            <div ref={receiptRef}>

              {/* ── Header ── */}
              <div style={{textAlign:'center',marginBottom:'2px'}}>
                <div style={{fontSize:'20px',fontWeight:'bold'}}>{data.storeName}</div>
                {data.storeAddress && <div style={{fontSize:'11px',color:'#444',marginTop:'2px'}}>{data.storeAddress}</div>}
                {data.storePhone   && <div style={{fontSize:'11px',color:'#444'}}>Tel: {data.storePhone}</div>}
              </div>

              {/* ── Divider ── */}
              <div style={{borderTop:'1px dashed #777',margin:'6px 0'}}/>

              {/* ── Sale info ── */}
              <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                <span style={{color:'#333'}}>Receipt #:</span>
                <span style={{fontWeight:'bold'}}>{shortId}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                <span style={{color:'#333'}}>Date:</span>
                <span>{data.date}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                <span style={{color:'#333'}}>Cashier:</span>
                <span>{data.cashierName}</span>
              </div>
              {data.customer && (
                <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                  <span style={{color:'#333'}}>Customer:</span>
                  <span>{data.customer}</span>
                </div>
              )}

              {/* ── Divider ── */}
              <div style={{borderTop:'1px dashed #777',margin:'6px 0'}}/>

              {/* ── Items table header ── */}
              <div style={{display:'flex',justifyContent:'space-between',fontWeight:'bold',fontSize:'11px',borderBottom:'1px solid #ccc',paddingBottom:'3px',marginBottom:'4px'}}>
                <span style={{flex:2}}>Item</span>
                <span style={{flex:'0 0 24px',textAlign:'center'}}>Qty</span>
                <span style={{flex:1.2,textAlign:'right'}}>Price</span>
                <span style={{flex:1.2,textAlign:'right'}}>Total</span>
              </div>

              {/* ── Items ── */}
              {data.items.map((item,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',fontSize:'12px'}}>
                  <span style={{flex:2,fontWeight:'bold'}}>{item.name}</span>
                  <span style={{flex:'0 0 24px',textAlign:'center'}}>{item.qty}</span>
                  <span style={{flex:1.2,textAlign:'right'}}>KES {item.price.toLocaleString('en-KE',{minimumFractionDigits:2})}</span>
                  <span style={{flex:1.2,textAlign:'right',fontWeight:'bold'}}>KES {item.total.toLocaleString('en-KE',{minimumFractionDigits:2})}</span>
                </div>
              ))}

              {/* ── Divider ── */}
              <div style={{borderTop:'1px dashed #777',margin:'6px 0'}}/>

              {/* ── Subtotal / discount / tax ── */}
              <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                <span>Subtotal:</span>
                <span>{fmt(data.subtotal)}</span>
              </div>
              {data.discount > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                  <span>Discount:</span>
                  <span>-{fmt(data.discount)}</span>
                </div>
              )}
              {data.tax > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',margin:'3px 0'}}>
                  <span>Tax ({Math.round(data.taxRate*100)}%):</span>
                  <span>{fmt(data.tax)}</span>
                </div>
              )}

              {/* ── Solid line + TOTAL ── */}
              <div style={{borderTop:'2px solid #000',margin:'6px 0'}}/>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'16px',fontWeight:'bold',margin:'4px 0'}}>
                <span>TOTAL:</span>
                <span>{fmt(data.total)}</span>
              </div>

              {/* ── Divider ── */}
              <div style={{borderTop:'1px dashed #777',margin:'6px 0'}}/>

              {/* ── Payment method ── */}
              <div style={{fontWeight:'bold',fontSize:'12px',marginBottom:'4px'}}>PAYMENT METHOD:</div>
              {data.payments.map((p,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'12px',margin:'3px 0'}}>
                  <span>{getLabel(p.method)}:</span>
                  <span>{fmt(p.amount)}</span>
                </div>
              ))}
              {data.change > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',margin:'3px 0',fontWeight:'bold'}}>
                  <span>Change:</span>
                  <span>{fmt(data.change)}</span>
                </div>
              )}

              {/* ── Divider ── */}
              <div style={{borderTop:'1px dashed #777',margin:'6px 0'}}/>

              {/* ── Footer messages ── */}
              <div style={{textAlign:'center',fontSize:'12px',fontWeight:'bold',margin:'3px 0'}}>
                {data.receiptFooter || 'Thank you for your business!'}
              </div>
              <div style={{textAlign:'center',fontSize:'11px',margin:'2px 0'}}>Please come again</div>
              <div style={{textAlign:'center',fontSize:'11px',margin:'2px 0'}}>We value our customers</div>

              {/* ── Receipt ID at bottom ── */}
              <div style={{textAlign:'center',fontSize:'11px',marginTop:'6px',color:'#444'}}>
                {shortId}
              </div>

            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">
            Skip
          </button>
          <button onClick={handlePrint}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
            <Printer className="w-4 h-4"/>Print Receipt
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Modal ────────────────────────────────────────
function PaymentModal({total,selectedCustomer,onComplete,onClose}:{
  total:number;selectedCustomer:Customer|null
  onComplete:(p:SplitPaymentEntry[])=>Promise<void>;onClose:()=>void
}) {
  const [payments,setPayments]=useState<SplitPaymentEntry[]>([{id:'1',method:'cash',amount:total}])
  const [isProcessing,setIsProcessing]=useState(false)
  const totalPaid=payments.reduce((s,p)=>s+(p.amount||0),0)
  const remaining=total-totalPaid
  const change=Math.max(0,totalPaid-total)
  const isFullyPaid=totalPaid>=total
  const hasCredit=payments.some(p=>p.method==='credit')
  const creditAmt=payments.find(p=>p.method==='credit')?.amount||0
  const pct=Math.min(100,(totalPaid/total)*100)
  const addPayment=()=>{const used=payments.map(p=>p.method);const next=paymentMethods.find(m=>!used.includes(m.id));if(!next)return;setPayments(prev=>[...prev,{id:Date.now().toString(),method:next.id,amount:Math.max(0,remaining)}])}
  const removePayment=(id:string)=>{if(payments.length>1)setPayments(prev=>prev.filter(p=>p.id!==id))}
  const updatePayment=(id:string,field:'method'|'amount',value:any)=>setPayments(prev=>prev.map(p=>p.id===id?{...p,[field]:value}:p))
  const fillRemaining=(id:string)=>{const others=payments.filter(p=>p.id!==id).reduce((s,p)=>s+(p.amount||0),0);updatePayment(id,'amount',Math.max(0,total-others))}
  const handleComplete=async()=>{
    if(!isFullyPaid){toast.error(`Short by KES ${Math.abs(remaining).toLocaleString()}`);return}
    if(hasCredit&&!selectedCustomer){toast.error('Select a customer for credit');return}
    setIsProcessing(true);try{await onComplete(payments)}finally{setIsProcessing(false)}
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div><h3 className="font-bold text-gray-800 text-lg">Payment</h3><p className="text-xs text-gray-400">Split across multiple methods if needed</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><X className="w-4 h-4"/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center">
            <div><p className="text-xs text-gray-400">Sale Total</p><p className="text-2xl font-black text-gray-800">KES {total.toLocaleString('en-KE',{minimumFractionDigits:2})}</p></div>
            {selectedCustomer&&(<div className="text-right"><p className="text-xs text-gray-400">{selectedCustomer.name}</p>{selectedCustomer.outstanding_balance>0&&<p className="text-xs text-orange-500 font-semibold">Debt: KES {selectedCustomer.outstanding_balance.toLocaleString()}</p>}</div>)}
          </div>
          {hasCredit&&selectedCustomer&&creditAmt>0&&(
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-orange-700 mb-1">Credit Sale</p>
              <div className="flex justify-between text-sm"><span className="text-orange-600">Current debt</span><span className="font-bold">KES {selectedCustomer.outstanding_balance.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-orange-600">+ This credit</span><span className="font-bold">KES {creditAmt.toLocaleString()}</span></div>
              <div className="border-t border-orange-200 mt-1 pt-1 flex justify-between font-black text-sm"><span className="text-orange-800">New total debt</span><span className="text-orange-800">KES {(selectedCustomer.outstanding_balance+creditAmt).toLocaleString()}</span></div>
            </div>
          )}
          <div className="space-y-3">
            {payments.map((payment,index)=>{
              const cfg=paymentMethods.find(m=>m.id===payment.method);const Icon=cfg?.icon||Banknote
              const used=payments.filter(p=>p.id!==payment.id).map(p=>p.method)
              return (
                <div key={payment.id} className={clsx('border-2 rounded-xl p-3.5',cfg?.light||'bg-gray-50 border-gray-200')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5"><Icon className="w-4 h-4"/><span className="text-xs font-bold uppercase">Payment {index+1}</span></div>
                    {payments.length>1&&<button onClick={()=>removePayment(payment.id)} className="w-5 h-5 rounded-full bg-white/70 hover:bg-red-100 flex items-center justify-center"><X className="w-3 h-3 text-red-500"/></button>}
                  </div>
                  <div className="flex gap-2">
                    <select value={payment.method} onChange={e=>updatePayment(payment.id,'method',e.target.value)} className="flex-1 px-2.5 py-2 bg-white border border-white/70 rounded-lg text-sm outline-none font-semibold">
                      {paymentMethods.map(m=><option key={m.id} value={m.id} disabled={used.includes(m.id)}>{m.label}</option>)}
                    </select>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-50">KES</span>
                      <input type="number" min="0" value={payment.amount||''} onChange={e=>updatePayment(payment.id,'amount',parseFloat(e.target.value)||0)} className="w-full pl-9 pr-2 py-2 bg-white border border-white/70 rounded-lg text-sm outline-none font-bold text-right"/>
                    </div>
                    {remaining>0&&<button onClick={()=>fillRemaining(payment.id)} className="px-2.5 py-2 bg-white/70 hover:bg-white border border-white/50 rounded-lg text-xs font-bold whitespace-nowrap">Fill ↑</button>}
                  </div>
                  {payment.method==='credit'&&!selectedCustomer&&<div className="mt-2 flex items-center gap-1 text-xs text-orange-700 font-medium"><AlertCircle className="w-3 h-3"/>Select a customer for credit</div>}
                </div>
              )
            })}
          </div>
          {payments.length<paymentMethods.length&&(
            <button onClick={addPayment} className="w-full py-2.5 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"><Plus className="w-4 h-4"/>Add Another Method</button>
          )}
          <div className={clsx('rounded-xl p-4 border-2 space-y-2',isFullyPaid?'bg-green-50 border-green-300':'bg-red-50 border-red-200')}>
            <div className="flex justify-between text-sm font-semibold"><span className="text-gray-600">Total Paid</span><span className="font-bold">KES {totalPaid.toLocaleString()}</span></div>
            {!isFullyPaid&&remaining>0&&<div className="flex justify-between text-sm font-bold"><span className="text-red-600">Remaining</span><span className="text-red-600">KES {remaining.toLocaleString()}</span></div>}
            {change>0&&<div className="flex justify-between font-black"><span className="text-green-700">Change</span><span className="text-green-700">KES {change.toLocaleString()}</span></div>}
            <div className="h-2 bg-white/60 rounded-full overflow-hidden"><div className={clsx('h-full rounded-full transition-all',isFullyPaid?'bg-green-500':'bg-red-400')} style={{width:`${pct}%`}}/></div>
            <p className={clsx('text-xs text-right font-semibold',isFullyPaid?'text-green-600':'text-red-500')}>{isFullyPaid?`✓ Paid${change>0?` · Change KES ${change.toLocaleString()}`:''}`: `${pct.toFixed(0)}% covered`}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleComplete} disabled={isProcessing||!isFullyPaid||(hasCredit&&!selectedCustomer)}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
            {isProcessing?<><Loader2 className="w-4 h-4 animate-spin"/>Processing...</>:<><CheckCircle className="w-4 h-4"/>Complete Sale</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main POS Page ────────────────────────────────────────
export default function POSPage() {
  const { profile } = useAuthStore()
  const { isOpen: registerIsOpen, openingAmount, openedAt, closeRegister } = useRegisterStore()

  const {
    cart, addToCart, removeFromCart, clearCart,
    selectedCustomer, setCustomer,
    discount, setDiscount,
    taxRate, fetchTaxRate,
    getSubtotal, getTax, getTotal,
  } = usePOSStore()

  const [products, setProducts]       = useState<Product[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)

  // ── Customer autocomplete ──
  const [customerQuery, setCustomerQuery]         = useState('')
  const [customerResults, setCustomerResults]     = useState<Customer[]>([])
  const [showCustomerDrop, setShowCustomerDrop]   = useState(false)
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  // ── Product autocomplete ──
  const [productQuery, setProductQuery]           = useState('')
  const [productResults, setProductResults]       = useState<Product[]>([])
  const [showProductDrop, setShowProductDrop]     = useState(false)
  const productRef = useRef<HTMLDivElement>(null)

  const [showPayModal, setShowPayModal]           = useState(false)
  const [showHeld, setShowHeld]                   = useState(false)
  const [showRecent, setShowRecent]               = useState(false)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [showCloseRegister, setShowCloseRegister] = useState(false)
  const [mobileTab, setMobileTab] = useState<'cart'|'products'>('products')
  const [receiptData, setReceiptData]             = useState<ReceiptData | null>(null)
  const [storeInfo, setStoreInfo] = useState({ address: '', phone: '', footer: 'Thank you for your business!' })
  const [suspendedOrders, setSuspendedOrders]     = useState<any[]>([])
  const [recentSales, setRecentSales]             = useState<any[]>([])
  const [newCustomerName, setNewCustomerName]     = useState('')
  const [newCustomerPhone, setNewCustomerPhone]   = useState('')
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)

  const subtotal = getSubtotal()
  const tax      = getTax()
  const total    = getTotal()
  const taxPct   = Math.round(taxRate * 100)
  const timeStr  = new Date().toLocaleString('en-KE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })

  useEffect(() => {
    fetchProducts()
    fetchCategories()
    fetchSuspended()
    fetchTaxRate(profile?.location_id || null)
    // Fetch store info for receipt
    supabase.from('store_settings').select('store_name,store_address,store_phone,receipt_footer').limit(1).single()
      .then(({ data }) => {
        if (data) setStoreInfo({
          address: data.store_address || '',
          phone:   data.store_phone   || '',
          footer:  data.receipt_footer || 'Thank you for your business!',
        })
      })
  }, [profile?.location_id])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setShowCustomerDrop(false)
      if (productRef.current && !productRef.current.contains(e.target as Node)) setShowProductDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchProducts = async () => {
    setIsLoadingProducts(true)
    let q = supabase.from('products').select('*, category:categories(id,name)').eq('is_active', true).order('name')
    if (profile?.role !== 'owner') q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setProducts(data || [])
    setIsLoadingProducts(false)
  }

  const fetchCategories = async () => {
    let q = supabase.from('categories').select('*').order('name')
    if (profile?.role !== 'owner') q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setCategories(data || [])
  }

  const fetchSuspended = async () => {
    const { data } = await supabase.from('suspended_orders').select('*').eq('cashier_id', profile?.id).order('created_at', { ascending: false })
    setSuspendedOrders(data || [])
  }

  const fetchRecent = async () => {
    let q = supabase.from('sales').select('*, customer:customers(name), sale_items(id), sale_payments(method,amount)').order('created_at', { ascending: false }).limit(10)
    if (profile?.role !== 'owner') q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setRecentSales(data || [])
  }

  // ── Customer search with debounce ──
  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 1) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true)
      try {
        let q = supabase.from('customers').select('*').ilike('name', `%${customerQuery}%`).limit(8)
        if (profile?.role !== 'owner') q = q.eq('location_id', profile?.location_id)
        const { data } = await q
        setCustomerResults(data || [])
        setShowCustomerDrop(true)
      } finally {
        setIsSearchingCustomer(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [customerQuery])

  // ── Product search — filter from loaded products list ──
  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([])
      setShowProductDrop(false)
      return
    }
    const q = productQuery.toLowerCase()
    const results = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    ).slice(0, 10)
    setProductResults(results)
    setShowProductDrop(true)
  }, [productQuery, products])

  const handleSelectCustomer = (c: Customer) => {
    setCustomer(c)
    setCustomerQuery('')
    setCustomerResults([])
    setShowCustomerDrop(false)
  }

  const handleSelectProduct = (product: Product) => {
    if (product.stock_quantity <= 0) { toast.error('Out of stock'); return }
    addToCart({
      product_id: product.id, product_name: product.name,
      unit_price: product.selling_price, selling_price: product.selling_price,
      quantity: 1, total_price: product.selling_price, stock_quantity: product.stock_quantity,
    })
    toast.success(`Added ${product.name}`, { duration: 600 })
    setProductQuery('')
    setProductResults([])
    setShowProductDrop(false)
    setMobileTab('cart')
  }

  // Grid click also adds product
  const handleAddToCart = (product: Product) => {
    if (product.stock_quantity <= 0) { toast.error('Out of stock'); return }
    addToCart({
      product_id: product.id, product_name: product.name,
      unit_price: product.selling_price, selling_price: product.selling_price,
      quantity: 1, total_price: product.selling_price, stock_quantity: product.stock_quantity,
    })
    toast.success(`Added ${product.name}`, { duration: 600 })
    setMobileTab('cart')
  }

  const handleQtyChange = (productId: string, newQty: number) => {
    if (newQty < 1) { removeFromCart(productId); return }
    usePOSStore.setState(state => ({ cart: state.cart.map(i => i.product_id === productId ? { ...i, quantity: newQty, total_price: i.unit_price * newQty } : i) }))
  }

  const handlePriceChange = (productId: string, newPrice: number) => {
    const item = usePOSStore.getState().cart.find(i => i.product_id === productId)
    if (!item) return

    if (newPrice < item.selling_price) {
      toast.error(
        `Cannot sell below selling price (KES ${item.selling_price.toLocaleString()})`,
        { id: 'price-warn', duration: 2500, icon: '🚫' }
      )
      // Clamp back to selling price
      newPrice = item.selling_price
    }

    usePOSStore.setState(state => ({
      cart: state.cart.map(i =>
        i.product_id === productId
          ? { ...i, unit_price: newPrice, total_price: newPrice * i.quantity }
          : i
      )
    }))
  }

  const handleSuspend = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    const label = `Order ${new Date().toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}`
    await supabase.from('suspended_orders').insert({ location_id: profile?.location_id, cashier_id: profile?.id, label, cart_data: cart })
    clearCart(); toast.success('Order suspended'); fetchSuspended()
  }

  const handleResumeOrder = async (order: any) => {
    order.cart_data.forEach((item: any) => addToCart(item))
    await supabase.from('suspended_orders').delete().eq('id', order.id)
    setShowHeld(false); toast.success('Order resumed'); fetchSuspended()
  }

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) { toast.error('Name required'); return }
    setIsCreatingCustomer(true)
    try {
      const { data, error } = await supabase.from('customers').insert({
        name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null,
        location_id: profile?.location_id, credit_limit: 0, outstanding_balance: 0,
      }).select().single()
      if (error) throw error
      setCustomer(data)
      setShowCreateCustomer(false); setNewCustomerName(''); setNewCustomerPhone('')
      toast.success(`"${data.name}" created and selected!`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create customer')
    } finally { setIsCreatingCustomer(false) }
  }

  const handleCheckout = async (payments: SplitPaymentEntry[]) => {
    if (cart.length === 0) return
    const totalPaid    = payments.reduce((s, p) => s + p.amount, 0)
    const change       = Math.max(0, totalPaid - total)
    const primary      = payments.reduce((a, b) => a.amount >= b.amount ? a : b)
    const creditAmount = payments.find(p => p.method === 'credit')?.amount || 0
    const isSplit      = payments.length > 1

    const { data: sale, error: saleError } = await supabase.from('sales').insert({
      location_id: profile?.location_id, cashier_id: profile?.id,
      customer_id: selectedCustomer?.id || null,
      subtotal, tax_amount: tax, discount_amount: discount, total_amount: total,
      payment_method: isSplit ? 'split' : primary.method,
      amount_paid: totalPaid, change_given: change,
    }).select().single()
    if (saleError) { toast.error(`Sale failed: ${saleError.message}`); throw saleError }

    const { error: itemsError } = await supabase.from('sale_items').insert(
      cart.map(item => ({
        sale_id: sale.id, product_id: item.product_id, product_name: item.product_name,
        quantity: item.quantity, unit_price: item.unit_price, total_price: item.total_price,
      }))
    )
    if (itemsError) {
      toast.error(`Items failed: ${itemsError.message}`)
      await supabase.from('sales').delete().eq('id', sale.id)
      throw itemsError
    }

    await supabase.from('sale_payments').insert(payments.map(p => ({ sale_id: sale.id, method: p.method, amount: p.amount })))

    if (creditAmount > 0 && selectedCustomer) {
      await supabase.from('customers').update({ outstanding_balance: (selectedCustomer.outstanding_balance || 0) + creditAmount }).eq('id', selectedCustomer.id)
    }

    const receipt: ReceiptData = {
      saleId: sale.id,
      storeName:    profile?.location?.name || 'My Shop',
      storeAddress: storeInfo.address,
      storePhone:   storeInfo.phone,
      branchName:   profile?.location?.name || 'Main Branch',
      cashierName:  profile?.full_name || 'Cashier',
      date: new Date().toLocaleString('en-KE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
      customer: selectedCustomer?.name || null, taxRate,
      items: cart.map(i => ({ name: i.product_name, qty: i.quantity, price: i.unit_price, total: i.total_price })),
      subtotal, tax, discount, total, payments, change,
      receiptFooter: storeInfo.footer,
    }

    clearCart(); setShowPayModal(false); setReceiptData(receipt); fetchProducts()

    if (creditAmount > 0 && selectedCustomer) {
      toast.success(`✅ Sale done! New debt: KES ${((selectedCustomer.outstanding_balance||0)+creditAmount).toLocaleString()}`, { duration: 4000 })
    } else {
      toast.success(`✅ Sale complete!${change > 0 ? ` Change: KES ${change.toFixed(0)}` : ''}`, { duration: 3000 })
    }
  }

  // Filtered product grid (uses selectedCategory only, not the autocomplete query)
  const gridProducts = products.filter(p =>
    selectedCategory === 'all' || p.category_id === selectedCategory
  )

  if (!registerIsOpen) {
    return (
      <div className="relative flex h-[calc(100vh-2rem)] -mt-6 -mx-6 bg-gray-100 overflow-hidden">
        <div className="flex-1 filter blur-sm pointer-events-none select-none opacity-50 bg-gray-100"/>
        {/* Show shift summary BEFORE the open-register modal if one is waiting */}
        <RegisterModal mode="open" onComplete={() => {}} />
      </div>
    )
  }

  const sessionInfo = openedAt
    ? `Shift since ${new Date(openedAt).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })} · Float KES ${openingAmount.toLocaleString()}`
    : ''

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -mt-6 -mx-6 bg-gray-100">

      {/* TOP BAR — pl-12 gives room for the floating sidebar toggle button */}
      <div className="bg-white border-b border-gray-200 pl-12 pr-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
            {profile?.location?.name || 'All Branches'}<ChevronDown className="w-3.5 h-3.5"/>
          </button>
          <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200">
            <Clock className="w-3.5 h-3.5"/>{timeStr}
          </div>
          {sessionInfo && (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
              <TrendingUp className="w-3.5 h-3.5 text-green-500"/>{sessionInfo}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 hidden sm:block"><strong>{profile?.full_name}</strong></span>
          <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">SHIFT ACTIVE</span>
          <button onClick={() => setShowCloseRegister(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg">
            <Lock className="w-3.5 h-3.5"/>Close Register
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Cart ── */}
        <div className={`${mobileTab === "cart" ? "flex" : "hidden"} md:flex w-full md:w-[58%] flex-col bg-white border-r border-gray-200`}>

          {/* ── Customer Autocomplete ── */}
          <div className="px-3 pt-2 pb-1.5 border-b border-gray-100">
            <div className="flex gap-2">
              <div ref={customerRef} className="flex-1 relative">
                {selectedCustomer ? (
                  /* Selected state */
                  <div className="flex items-center gap-2 border border-blue-300 bg-blue-50 rounded-xl px-3 py-1.5">
                    <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {selectedCustomer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-800 truncate">{selectedCustomer.name}</p>
                      {selectedCustomer.outstanding_balance > 0 && (
                        <p className="text-xs text-orange-500 font-semibold">Debt: KES {selectedCustomer.outstanding_balance.toLocaleString()}</p>
                      )}
                    </div>
                    <button onClick={() => { setCustomer(null); setCustomerQuery('') }}
                      className="w-6 h-6 rounded-full bg-blue-200 hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors">
                      <X className="w-3 h-3 text-blue-700 hover:text-red-500"/>
                    </button>
                  </div>
                ) : (
                  /* Search state */
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                    <input
                      type="text"
                      placeholder="Search customer name or phone..."
                      value={customerQuery}
                      onChange={e => { setCustomerQuery(e.target.value); setShowCustomerDrop(true) }}
                      onFocus={() => { if (customerQuery.length >= 1) setShowCustomerDrop(true) }}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-blue-400 focus:bg-white bg-gray-50 transition-colors"
                    />
                    {isSearchingCustomer && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin"/>
                    )}
                  </div>
                )}

                {/* Customer dropdown */}
                {!selectedCustomer && showCustomerDrop && (
                  <AutocompleteDropdown
                    items={customerResults}
                    onSelect={handleSelectCustomer}
                    emptyText={customerQuery.length >= 1 && !isSearchingCustomer ? 'No customers found' : undefined}
                    renderItem={(c: Customer) => (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{c.name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {c.phone || 'No phone'}
                            {c.outstanding_balance > 0 && (
                              <span className="text-orange-500 font-semibold"> · Debt: KES {c.outstanding_balance.toLocaleString()}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  />
                )}
              </div>

              {/* Add customer button */}
              <button onClick={() => setShowCreateCustomer(true)}
                className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center shrink-0 transition-colors"
                title="Add new customer">
                <UserPlus className="w-4 h-4"/>
              </button>
            </div>
          </div>

          {/* ── Product Search Autocomplete ── */}
          <div className="px-3 py-1.5 border-b border-gray-100">
            <div ref={productRef} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
              <input
                type="text"
                placeholder="Search product name or scan barcode..."
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                onFocus={() => { if (productResults.length > 0) setShowProductDrop(true) }}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:bg-white bg-gray-50 transition-colors"
              />
              {productQuery && (
                <button onClick={() => { setProductQuery(''); setProductResults([]); setShowProductDrop(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center">
                  <X className="w-3 h-3 text-gray-500"/>
                </button>
              )}

              {/* Product dropdown */}
              {showProductDrop && productResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto">
                  {productResults.map(product => (
                    <button
                      key={product.id}
                      onMouseDown={e => { e.preventDefault(); handleSelectProduct(product) }}
                      disabled={product.stock_quantity <= 0}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 border-b border-gray-50 last:border-0 transition-colors flex items-center gap-3',
                        product.stock_quantity <= 0
                          ? 'opacity-40 cursor-not-allowed bg-gray-50'
                          : 'hover:bg-blue-50'
                      )}>
                      {/* Product icon */}
                      <div className="w-9 h-9 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-blue-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{product.name}</p>
                        <p className="text-xs text-gray-400">
                          KES {product.selling_price.toLocaleString()}
                          <span className={clsx('ml-2 font-semibold', product.stock_quantity <= 10 ? 'text-orange-500' : 'text-gray-400')}>
                            · Stock: {product.stock_quantity}
                          </span>
                        </p>
                      </div>
                      {product.stock_quantity <= 0
                        ? <span className="text-xs text-red-400 font-semibold shrink-0">Out of stock</span>
                        : <span className="text-xs text-blue-500 font-semibold shrink-0">+ Add</span>
                      }
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showProductDrop && productQuery.length > 0 && productResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-4 py-3 text-sm text-gray-400 text-center">
                  No products matching "<strong>{productQuery}</strong>"
                </div>
              )}
            </div>
          </div>

          {/* Cart table */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 py-12">
                <Package className="w-14 h-14 mb-3 opacity-40"/>
                <p className="text-sm font-medium text-gray-400">Cart is empty</p>
                <p className="text-xs text-gray-300 mt-1">Search a product above or click from the grid →</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Product</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Qty</th>
                    <th className="text-right px-2 py-2.5 text-xs font-semibold text-gray-500">Price {taxPct > 0 ? `(+${taxPct}%)` : ''}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Subtotal</th>
                    <th className="w-8"/>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.product_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-1.5">
                        <p className="font-semibold text-gray-800 text-sm leading-tight">{item.product_name}</p>
                        <p className="text-xs text-gray-400">Stock: {item.stock_quantity}</p>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleQtyChange(item.product_id, item.quantity - 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0">
                            <Minus className="w-3 h-3 text-gray-600"/>
                          </button>
                          <input type="number" min="1" max={item.stock_quantity} value={item.quantity}
                            onChange={e => handleQtyChange(item.product_id, parseInt(e.target.value) || 1)}
                            className="w-12 text-center font-bold text-gray-800 border-2 border-blue-200 rounded-lg py-0.5 outline-none focus:border-blue-500 bg-white text-sm"/>
                          <button onClick={() => handleQtyChange(item.product_id, item.quantity + 1)}
                            disabled={item.quantity >= item.stock_quantity}
                            className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 disabled:opacity-40 flex items-center justify-center shrink-0">
                            <Plus className="w-3 h-3 text-blue-600"/>
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="relative group/price">
                          <input type="number" min={item.selling_price} value={item.unit_price}
                            onChange={e => handlePriceChange(item.product_id, parseFloat(e.target.value) || 0)}
                            className={`w-24 text-right font-semibold border-2 rounded-lg py-1 px-2 outline-none bg-white text-sm transition-colors ${
                              item.unit_price < item.selling_price
                                ? 'border-red-400 text-red-600 focus:border-red-500'
                                : 'border-gray-200 text-gray-700 focus:border-orange-400'
                            }`}
                          />
                          {item.unit_price < item.selling_price && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-red-600 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/price:opacity-100 transition-opacity pointer-events-none z-10">
                              Below selling price · KES {item.selling_price.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <span className="font-bold text-gray-800 whitespace-nowrap">KES {item.total_price.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                      </td>
                      <td className="pr-2 py-1.5">
                        <button onClick={() => removeFromCart(item.product_id)}
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center">
                          <X className="w-3.5 h-3.5 text-red-400"/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 px-4 py-1.5 bg-gray-50 space-y-0.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal ({cart.reduce((s,i)=>s+i.quantity,0)} items)</span>
              <span className="font-medium text-gray-700">KES {subtotal.toLocaleString('en-KE',{minimumFractionDigits:2})}</span>
            </div>
            {taxPct > 0
              ? <div className="flex justify-between text-sm text-gray-500"><span>Tax ({taxPct}%)</span><span className="font-medium">KES {tax.toLocaleString('en-KE',{minimumFractionDigits:2})}</span></div>
              : <div className="flex justify-between text-sm"><span className="text-gray-400">Tax</span><span className="text-green-600 font-medium text-sm">No tax (0%)</span></div>
            }
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Discount KES</label>
              <input type="number" min="0"
                max={profile?.role === 'owner' ? undefined : Math.floor(subtotal * 0.30)}
                value={discount||''}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0
                  const maxDiscount = subtotal * 0.30
                  if (profile?.role !== 'owner' && val > maxDiscount) {
                    toast.error(`Max discount is 30% (KES ${Math.floor(maxDiscount).toLocaleString()})`, { id: 'disc-warn', icon: '🚫' })
                    setDiscount(Math.floor(maxDiscount))
                  } else {
                    setDiscount(val)
                  }
                }}
                placeholder="0"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-400 bg-white"/>
              {profile?.role !== 'owner' && subtotal > 0 && (
                <span className="text-xs text-gray-400 shrink-0">max {Math.floor(subtotal*0.30).toLocaleString()}</span>
              )}
              <span className="text-xs text-gray-400 shrink-0">Total:</span>
              <span className="font-black text-blue-600 text-base shrink-0">KES {total.toLocaleString('en-KE',{minimumFractionDigits:2})}</span>
            </div>
          </div>

          {/* Single combined action bar */}
          <div className="border-t border-gray-200 px-3 py-2 bg-white space-y-1.5">
            {/* Top row: secondary actions */}
            <div className="flex gap-1.5">
              <button onClick={handleSuspend} className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-yellow-400 text-yellow-600 rounded-lg hover:bg-yellow-50 text-xs font-semibold"><Clock className="w-3.5 h-3.5"/>Suspend</button>
              <button onClick={()=>{fetchSuspended();setShowHeld(true)}} className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-semibold"><Eye className="w-3.5 h-3.5"/>Held ({suspendedOrders.length})</button>
              <button onClick={()=>{fetchRecent();setShowRecent(true)}} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-xs font-semibold"><History className="w-3.5 h-3.5"/>History</button>
              <button onClick={()=>setShowPayModal(true)} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-semibold"><Layers className="w-3.5 h-3.5"/>Split</button>
              <button onClick={clearCart} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-xs font-semibold"><X className="w-3.5 h-3.5"/>Clear</button>
            </div>
            {/* Bottom row: pay */}
            <div className="flex items-center gap-2">
              <div className="shrink-0">
                <p className="text-xs text-gray-400 leading-none">Total</p>
                <p className="text-xl font-black text-gray-800 leading-tight">KES {total.toLocaleString('en-KE',{minimumFractionDigits:2})}</p>
              </div>
              <button onClick={()=>setShowPayModal(true)} disabled={cart.length===0}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-black rounded-xl text-base disabled:cursor-not-allowed shadow-lg shadow-green-100">
                Pay Now
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Product Grid ── */}
        <div className={`${mobileTab === "products" ? "flex" : "hidden"} md:flex flex-1 flex-col bg-gray-50`}>
          <div className="px-3 pt-3 pb-2">
            <button onClick={()=>setSelectedCategory('all')}
              className={clsx('w-full py-2 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2',
                selectedCategory==='all'?'bg-blue-600 text-white':'bg-white text-gray-700 border border-gray-200 hover:bg-blue-50')}>
              <Package className="w-4 h-4"/>All Categories
            </button>
          </div>
          {categories.length>0&&(
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {categories.map(cat=>(
                <button key={cat.id} onClick={()=>setSelectedCategory(cat.id)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    selectedCategory===cat.id?'bg-blue-600 text-white':'bg-white text-gray-600 border border-gray-200 hover:border-blue-300')}>
                  {cat.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {isLoadingProducts ? (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">{[...Array(6)].map((_,i)=><div key={i} className="bg-gray-200 rounded-xl h-28 animate-pulse"/>)}</div>
            ) : gridProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-300"><Package className="w-12 h-12 mb-2"/><p className="text-sm">No products found</p></div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
                {gridProducts.map(product=>(
                  <button key={product.id} onClick={()=>handleAddToCart(product)} disabled={product.stock_quantity<=0}
                    className={clsx('text-left p-3 rounded-xl border-2 transition-all bg-white',
                      product.stock_quantity<=0?'opacity-50 cursor-not-allowed border-gray-200':'border-gray-200 hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5')}>
                    <div className="w-full h-14 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg mb-2 flex items-center justify-center"><Package className="w-6 h-6 text-blue-400"/></div>
                    <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1">{product.name}</p>
                    <p className="text-sm font-bold text-blue-600">KES {product.selling_price.toLocaleString()}</p>
                    <p className={clsx('text-xs mt-0.5',product.stock_quantity<=10?'text-orange-500 font-medium':'text-gray-400')}>Stock: {product.stock_quantity}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* ── Mobile Tab Bar (shown only on small screens) ── */}
      <div className="md:hidden flex border-t-2 border-gray-200 bg-white shrink-0 z-20">
        <button
          onClick={() => setMobileTab('products')}
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-bold transition-colors ${
            mobileTab === 'products'
              ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600 -mt-0.5'
              : 'text-gray-400 hover:text-gray-600'
          }`}>
          <Package className="w-5 h-5"/>
          <span>Products</span>
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-bold transition-colors relative ${
            mobileTab === 'cart'
              ? 'text-blue-600 bg-blue-50 border-t-2 border-blue-600 -mt-0.5'
              : 'text-gray-400 hover:text-gray-600'
          }`}>
          <div className="relative">
            <Receipt className="w-5 h-5"/>
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-black leading-none">
                {cart.length}
              </span>
            )}
          </div>
          <span>Cart{cart.length > 0 ? ` (${cart.length})` : ''}</span>
        </button>
      </div>

      </div>

      {/* MODALS */}
      {showCloseRegister&&<RegisterModal mode="close" onComplete={()=>{setShowCloseRegister(false);closeRegister()}}/>}
      {showPayModal&&<PaymentModal total={total} selectedCustomer={selectedCustomer} onComplete={handleCheckout} onClose={()=>setShowPayModal(false)}/>}
      {receiptData&&<ThermalReceipt data={receiptData} onClose={()=>setReceiptData(null)}/>}

      {showHeld&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="font-bold">Held Orders</h3><p className="text-xs text-gray-400">Tap to resume</p></div>
              <button onClick={()=>setShowHeld(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {suspendedOrders.length===0
                ?<div className="text-center py-8 text-gray-400"><Clock className="w-10 h-10 mx-auto mb-2 opacity-50"/><p className="text-sm">No held orders</p></div>
                :<div className="space-y-2">{suspendedOrders.map(order=>(
                  <div key={order.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                    <div><p className="font-semibold text-gray-800 text-sm">{order.label}</p><p className="text-xs text-gray-400">{order.cart_data.length} items · {new Date(order.created_at).toLocaleTimeString('en-KE')}</p></div>
                    <button onClick={()=>handleResumeOrder(order)} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">Resume</button>
                  </div>
                ))}</div>
              }
            </div>
          </div>
        </div>
      )}

      {showRecent&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="font-bold">Recent Sales</h3><p className="text-xs text-gray-400">Latest transactions</p></div>
              <button onClick={()=>setShowRecent(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-2">
              {recentSales.length===0
                ?<div className="text-center py-8 text-gray-400"><Receipt className="w-10 h-10 mx-auto mb-2 opacity-50"/><p className="text-sm">No recent sales</p></div>
                :recentSales.map(sale=>(
                  <div key={sale.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{sale.customer?.name||'Walk-In'}</p>
                      <p className="text-xs text-gray-400">{sale.sale_items?.length||0} items · {new Date(sale.created_at).toLocaleTimeString('en-KE')}</p>
                    </div>
                    <p className="font-bold text-blue-600 text-sm">KES {sale.total_amount.toLocaleString()}</p>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {showCreateCustomer&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="font-bold">New Customer</h3><p className="text-xs text-gray-400">Create and select instantly</p></div>
              <button onClick={()=>{setShowCreateCustomer(false);setNewCustomerName('');setNewCustomerPhone('')}}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
                <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                  <input type="text" value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreateCustomer()} placeholder="e.g. John Doe" autoFocus
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone (optional)</label>
                <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                  <input type="tel" value={newCustomerPhone} onChange={e=>setNewCustomerPhone(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreateCustomer()} placeholder="+254 7XX XXX XXX"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50"/>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{setShowCreateCustomer(false);setNewCustomerName('');setNewCustomerPhone('')}} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
                <button onClick={handleCreateCustomer} disabled={isCreatingCustomer||!newCustomerName.trim()} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {isCreatingCustomer?<><Loader2 className="w-4 h-4 animate-spin"/>Creating...</>:<><UserPlus className="w-4 h-4"/>Create &amp; Select</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}