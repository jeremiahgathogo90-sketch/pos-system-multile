import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useRealtime } from '../../hooks/useRealtime'
import {
  Package, Plus, Truck, CheckCircle,
  XCircle, Clock, Search, X, Loader2, Eye,
  RefreshCw, Warehouse, ChevronDown, AlertCircle,
  Building2, PackagePlus, Tag,
  Sliders, TriangleAlert, DollarSign, ChevronRight, Activity, Printer, CheckCheck
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────
interface Store { id: string; name: string; address: string; is_active: boolean }
interface StoreStock {
  id: string; store_id: string; product_id: string; quantity: number
  product: { id: string; name: string; barcode: string | null; selling_price: number; buying_price: number }
}
interface Location { id: string; name: string; is_active: boolean }
interface Transfer {
  id: string; transfer_number: string; created_at: string; status: string
  notes: string | null; store_id: string
  location: { name: string } | null
  creator: { full_name: string } | null
  approver: { full_name: string } | null
  stock_transfer_items: { id: string; product_name: string; quantity: number; unit_cost: number }[]
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending:   { label: 'Pending',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  approved:  { label: 'Approved',  color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: CheckCircle },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200',    icon: CheckCircle },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700 border-red-200',          icon: XCircle },
}

// ── Print Transfer Receipt ────────────────────────────────
function printTransferReceipt(transfer: Transfer, storeName: string) {
  const totalUnits = transfer.stock_transfer_items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = transfer.stock_transfer_items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const date = new Date(transfer.created_at).toLocaleString('en-KE', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  const rows = transfer.stock_transfer_items.map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px">${item.product_name}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;font-size:13px">${item.quantity}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">KES ${item.unit_cost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;font-size:13px">KES ${(item.quantity * item.unit_cost).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')
  const statusColors: Record<string, string> = { pending:'#f59e0b', approved:'#3b82f6', completed:'#10b981', rejected:'#ef4444' }
  const statusColor = statusColors[transfer.status] || '#6b7280'
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Transfer Receipt</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:#fff;padding:32px;max-width:680px;margin:0 auto}@media print{body{padding:16px}}</style>
  </head><body>
  <div style="border-bottom:3px solid #0d9488;padding-bottom:20px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div style="font-size:22px;font-weight:900;color:#0d9488">${storeName}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">STOCK TRANSFER RECEIPT</div></div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:800;color:#1f2937">${transfer.transfer_number}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${date}</div>
        <div style="margin-top:6px;display:inline-block;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase">${transfer.status}</div>
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">From (Warehouse)</div><div style="font-size:14px;font-weight:700">${storeName}</div></div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px"><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">To (Branch)</div><div style="font-size:14px;font-weight:700">${transfer.location?.name || '—'}</div></div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">Created By</div><div style="font-size:14px;font-weight:700">${transfer.creator?.full_name || '—'}</div></div>
    ${transfer.approver ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px"><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">Approved By</div><div style="font-size:14px;font-weight:700">${transfer.approver.full_name}</div></div>` : ''}
  </div>
  ${transfer.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:24px"><div style="font-size:10px;text-transform:uppercase;color:#92400e;font-weight:600;margin-bottom:4px">Notes</div><div style="font-size:13px;color:#78350f">${transfer.notes}</div></div>` : ''}
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#0d9488;color:white">
      <th style="padding:10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase">Product</th>
      <th style="padding:10px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase">Qty</th>
      <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase">Unit Cost</th>
      <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f0fdfa;border-top:2px solid #0d9488">
      <td style="padding:12px 10px;font-weight:800;font-size:14px;color:#0d9488">TOTAL</td>
      <td style="padding:12px 10px;text-align:center;font-weight:800;font-size:14px;color:#0d9488">${totalUnits} units</td>
      <td></td>
      <td style="padding:12px 10px;text-align:right;font-weight:800;font-size:14px;color:#0d9488">KES ${totalValue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
    </tr></tfoot>
  </table>
  <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:48px">
    <div style="text-align:center"><div style="border-top:1px solid #1f2937;padding-top:8px;font-size:11px;color:#6b7280">Prepared By</div></div>
    <div style="text-align:center"><div style="border-top:1px solid #1f2937;padding-top:8px;font-size:11px;color:#6b7280">Authorized By</div></div>
  </div>
  <div style="margin-top:32px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #f0f0f0;padding-top:16px">Generated by POS System · ${new Date().toLocaleString('en-KE')}</div>
  <script>window.onload=function(){window.print()}<\/script></body></html>`
  const win = window.open('', '_blank', 'width=760,height=900')
  if (win) { win.document.write(html); win.document.close() }
}

// ── New Product Modal ─────────────────────────────────────
// Schema: id, location_id, category_id, name, barcode, buying_price,
//         selling_price, stock_quantity, unit, is_active, created_at, updated_at
function NewProductModal({
  categories, store, onSave, onClose
}: {
  categories: { id: string; name: string }[]
  store: Store | null
  onSave: (productId: string) => void
  onClose: () => void
}) {
  const [name, setName]               = useState('')
  const [barcode, setBarcode]         = useState('')   // ← barcode (not sku)
  const [categoryId, setCategoryId]   = useState('')
  const [buyingPrice, setBuyingPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [unit, setUnit]               = useState('')   // ← unit field
  const [initialQty, setInitialQty]   = useState('')
  const [addToStore, setAddToStore]   = useState(true)
  const [isSaving, setIsSaving]       = useState(false)

  const handleBuyingPrice = (val: string) => {
    setBuyingPrice(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0 && !sellingPrice) {
      setSellingPrice(Math.ceil(num * 1.3).toString())
    }
  }

  const margin = buyingPrice && sellingPrice
    ? (((parseFloat(sellingPrice) - parseFloat(buyingPrice)) / parseFloat(buyingPrice)) * 100).toFixed(0)
    : null

  const handleSave = async () => {
    if (!name.trim())                                        { toast.error('Product name is required'); return }
    if (!buyingPrice || parseFloat(buyingPrice) <= 0)        { toast.error('Buying price is required'); return }
    if (!sellingPrice || parseFloat(sellingPrice) <= 0)      { toast.error('Selling price is required'); return }
    if (parseFloat(sellingPrice) < parseFloat(buyingPrice))  { toast.error('Selling price cannot be less than buying price'); return }

    setIsSaving(true)
    try {
      // Only insert columns that exist in the products table
      const { data: product, error: pErr } = await supabase
        .from('products')
        .insert({
          name:           name.trim(),
          barcode:        barcode.trim() || null,   // ← barcode not sku
          category_id:    categoryId || null,
          buying_price:   parseFloat(buyingPrice),
          selling_price:  parseFloat(sellingPrice),
          stock_quantity: 0,                        // ← column exists ✓
          unit:           unit.trim() || null,      // ← column exists ✓
          is_active:      true,                     // ← column exists ✓
          // location_id intentionally omitted — warehouse products don't need a branch
        })
        .select()
        .single()
      if (pErr) throw pErr

      // Add initial stock to warehouse store_stock
      const qty = parseInt(initialQty) || 0
      if (addToStore && store && qty > 0) {
        await supabase.from('store_stock').insert({
          store_id:   store.id,
          product_id: product.id,
          quantity:   qty,
        })
      }

      toast.success(`"${product.name}" created!${addToStore && qty > 0 ? ` ${qty} units added to warehouse.` : ''}`)
      onSave(product.id)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create product')
    } finally {
      setIsSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-50 bg-gray-50 transition-all'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Tag className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">Add New Product</h3>
              <p className="text-xs text-gray-400">Create product and add to warehouse</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Product Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Coca Cola 500ml" className={inputClass} autoFocus />
          </div>

          {/* Barcode + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Barcode / SKU</label>
              <input value={barcode} onChange={e => setBarcode(e.target.value)}
                placeholder="Optional" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
              <div className="relative">
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                  className={inputClass + ' appearance-none pr-8'}>
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Buying Price (KES) *</label>
              <input type="number" min="0" value={buyingPrice}
                onChange={e => handleBuyingPrice(e.target.value)}
                placeholder="0.00" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                Selling Price (KES) *
                {margin && (
                  <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded-full',
                    parseFloat(margin) < 0 ? 'bg-red-100 text-red-600' :
                    parseFloat(margin) < 10 ? 'bg-orange-100 text-orange-600' :
                    'bg-green-100 text-green-600')}>
                    {margin}% margin
                  </span>
                )}
              </label>
              <input type="number" min="0" value={sellingPrice}
                onChange={e => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className={clsx(inputClass,
                  sellingPrice && buyingPrice && parseFloat(sellingPrice) < parseFloat(buyingPrice)
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-50' : '')} />
              {sellingPrice && buyingPrice && parseFloat(sellingPrice) < parseFloat(buyingPrice) && (
                <p className="text-xs text-red-500 mt-1">⚠ Selling below buying price</p>
              )}
            </div>
          </div>

          {/* Unit */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Unit of Measure</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'dozen'].map(u => (
                <button key={u} onClick={() => setUnit(u)}
                  className={clsx('px-3 py-1 rounded-lg text-xs font-semibold border transition-all',
                    unit === u ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-purple-300')}>
                  {u}
                </button>
              ))}
            </div>
            <input value={unit} onChange={e => setUnit(e.target.value)}
              placeholder="Or type custom unit..."
              className={inputClass} />
          </div>
        </div>

        {/* Initial stock toggle */}
        <div className="px-6 pb-4 space-y-3">
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-700">Add initial stock to warehouse</p>
              <p className="text-xs text-gray-400 mt-0.5">Units immediately available for transfer</p>
            </div>
            <button onClick={() => setAddToStore(v => !v)}
              className={clsx('w-11 h-6 rounded-full transition-colors relative shrink-0',
                addToStore ? 'bg-purple-500' : 'bg-gray-300')}>
              <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                addToStore ? 'left-5' : 'left-0.5')} />
            </button>
          </div>
          {addToStore && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Initial Quantity</label>
              <input type="number" min="0" value={initialQty}
                onChange={e => setInitialQty(e.target.value)} placeholder="0"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 bg-gray-50" />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving}
            className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Tag className="w-4 h-4" />Create Product</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Receive Stock Modal ───────────────────────────────────
function ReceiveStockModal({ store, onSave, onClose }: { store: Store; onSave: () => void; onClose: () => void }) {
  const [search, setSearch]           = useState('')
  const [results, setResults]         = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving]       = useState(false)
  const [items, setItems]             = useState<{ product_id: string; product_name: string; quantity: number; unit_cost: number }[]>([])

  const searchProducts = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    try {
      const { data } = await supabase.from('products')
        .select('id, name, barcode, buying_price')
        .eq('is_active', true).ilike('name', `%${q}%`).limit(10)
      setResults(data || [])
    } finally { setIsSearching(false) }
  }

  useEffect(() => {
    const t = setTimeout(() => searchProducts(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const addItem = (product: any) => {
    if (items.find(i => i.product_id === product.id)) return
    setItems(prev => [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_cost: product.buying_price || 0 }])
    setSearch(''); setResults([])
  }

  const updateItem = (productId: string, field: 'quantity' | 'unit_cost', value: number) =>
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: Math.max(0, value) } : i))

  const removeItem = (productId: string) => setItems(prev => prev.filter(i => i.product_id !== productId))

  const handleSave = async () => {
    if (items.length === 0) { toast.error('Add at least one product'); return }
    for (const item of items) if (item.quantity <= 0) { toast.error(`${item.product_name}: quantity must be > 0`); return }
    setIsSaving(true)
    try {
      for (const item of items) {
        const { data: existing } = await supabase.from('store_stock').select('id, quantity')
          .eq('store_id', store.id).eq('product_id', item.product_id).maybeSingle()
        if (existing) {
          await supabase.from('store_stock').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id)
        } else {
          await supabase.from('store_stock').insert({ store_id: store.id, product_id: item.product_id, quantity: item.quantity })
        }
      }
      toast.success(`Stock received — ${items.length} product(s) updated`)
      onSave(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to receive stock')
    } finally { setIsSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <PackagePlus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">Receive Stock</h3>
              <p className="text-xs text-gray-400">Add incoming stock to {store.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search product to receive..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-400 bg-gray-50" />
            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
          </div>

          {results.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-md">
              {results.map(product => (
                <button key={product.id} onMouseDown={() => addItem(product)}
                  disabled={!!items.find(i => i.product_id === product.id)}
                  className={clsx('w-full flex items-center justify-between px-4 py-3 text-left border-b border-gray-50 last:border-0 text-sm',
                    items.find(i => i.product_id === product.id) ? 'bg-green-50 cursor-default' : 'hover:bg-green-50')}>
                  <div>
                    <p className="font-semibold text-gray-800">{product.name}</p>
                    {product.barcode && <p className="text-xs text-gray-400">{product.barcode}</p>}
                  </div>
                  {items.find(i => i.product_id === product.id)
                    ? <span className="text-xs text-green-600 font-semibold">Added ✓</span>
                    : <Plus className="w-4 h-4 text-green-500" />}
                </button>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Product</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Unit Cost</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => (
                    <tr key={item.product_id}>
                      <td className="px-3 py-2 font-medium text-gray-800">{item.product_name}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" value={item.quantity}
                          onChange={e => updateItem(item.product_id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-20 mx-auto block text-center font-bold border-2 border-green-200 rounded-lg py-1 text-sm outline-none focus:border-green-500" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" value={item.unit_cost}
                          onChange={e => updateItem(item.product_id, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-28 ml-auto block text-right font-medium border border-gray-200 rounded-lg py-1 px-2 text-sm outline-none focus:border-green-400" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeItem(item.product_id)}
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center">
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-green-50 border-t border-green-100">
                  <tr>
                    <td className="px-3 py-2 font-semibold text-green-700">Total</td>
                    <td className="px-3 py-2 text-center font-black text-green-700">{items.reduce((s, i) => s + i.quantity, 0)} units</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">KES {items.reduce((s, i) => s + i.quantity * i.unit_cost, 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || items.length === 0}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><PackagePlus className="w-4 h-4" />Receive Stock</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New Transfer Modal ────────────────────────────────────
function NewTransferModal({ store, storeStock, locations, onSave, onClose }: {
  store: Store; storeStock: StoreStock[]; locations: Location[]; onSave: () => void; onClose: () => void
}) {
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes]           = useState('')
  const [search, setSearch]         = useState('')
  const [items, setItems]           = useState<{ product_id: string; product_name: string; quantity: number; available: number; unit_cost: number }[]>([])
  const [isSaving, setIsSaving]     = useState(false)

  const filteredStock = storeStock.filter(s => !search || s.product.name.toLowerCase().includes(search.toLowerCase()))

  const addItem = (stock: StoreStock) => {
    if (items.find(i => i.product_id === stock.product_id)) return
    setItems(prev => [...prev, { product_id: stock.product_id, product_name: stock.product.name, quantity: 1, available: stock.quantity, unit_cost: stock.product.buying_price }])
    setSearch('')
  }

  const updateQty = (productId: string, qty: number) =>
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: Math.min(Math.max(1, qty), i.available) } : i))

  const removeItem = (productId: string) => setItems(prev => prev.filter(i => i.product_id !== productId))

  const handleSave = async () => {
    if (!locationId)        { toast.error('Select a destination branch'); return }
    if (items.length === 0) { toast.error('Add at least one product'); return }
    for (const item of items) {
      if (item.quantity > item.available) { toast.error(`${item.product_name}: only ${item.available} in stock`); return }
    }
    setIsSaving(true)
    try {
      const { data: transfer, error: tErr } = await supabase
        .from('stock_transfers')
        .insert({ store_id: store.id, location_id: locationId, notes: notes || null })
        .select().single()
      if (tErr) throw tErr
      const { error: iErr } = await supabase.from('stock_transfer_items').insert(
        items.map(i => ({ transfer_id: transfer.id, product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit_cost: i.unit_cost }))
      )
      if (iErr) throw iErr
      toast.success('Transfer request created!')
      onSave(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create transfer')
    } finally { setIsSaving(false) }
  }

  const totalItems = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">New Stock Transfer</h3>
              <p className="text-xs text-gray-400">From: {store.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Branch selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">Destination Branch *</label>
              <span className="text-xs text-gray-400">{locations.filter(l => l.is_active).length} branches</span>
            </div>
            {locations.filter(l => l.is_active).length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <Building2 className="w-5 h-5 text-orange-500 shrink-0" />
                <p className="text-sm text-orange-700 font-medium">No active branches registered yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {locations.filter(l => l.is_active).map(l => (
                  <button key={l.id} onClick={() => setLocationId(l.id)}
                    className={clsx('flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                      locationId === l.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50')}>
                    <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-black text-sm',
                      locationId === l.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600')}>
                      {l.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-sm font-semibold truncate', locationId === l.id ? 'text-teal-800' : 'text-gray-800')}>{l.name}</p>
                      <p className={clsx('text-xs', locationId === l.id ? 'text-teal-600' : 'text-gray-400')}>Branch</p>
                    </div>
                    {locationId === l.id && <CheckCheck className="w-4 h-4 text-teal-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Add Products</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search product in warehouse..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-400 bg-gray-50" />
            </div>
            {search && (
              <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                {filteredStock.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">No products found</div>
                ) : filteredStock.map(stock => (
                  <button key={stock.product_id} onMouseDown={() => addItem(stock)}
                    disabled={stock.quantity === 0 || !!items.find(i => i.product_id === stock.product_id)}
                    className={clsx('w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-gray-50 last:border-0 transition-colors',
                      stock.quantity === 0 ? 'opacity-40 cursor-not-allowed bg-gray-50' :
                      items.find(i => i.product_id === stock.product_id) ? 'bg-teal-50 cursor-default' : 'hover:bg-teal-50')}>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{stock.product.name}</p>
                      <p className="text-xs text-gray-400">Available: {stock.quantity}</p>
                    </div>
                    {items.find(i => i.product_id === stock.product_id)
                      ? <span className="text-xs text-teal-600 font-semibold">Added ✓</span>
                      : <Plus className="w-4 h-4 text-teal-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transfer items */}
          {items.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Transfer Items ({items.length})</label>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Product</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Available</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Qty</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map(item => (
                      <tr key={item.product_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{item.product_name}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={clsx('text-xs font-semibold', item.available < 10 ? 'text-orange-500' : 'text-gray-500')}>{item.available}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateQty(item.product_id, item.quantity - 1)}
                              className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center">
                              <span className="text-gray-600 font-bold text-sm leading-none">−</span>
                            </button>
                            <input type="number" min={1} max={item.available} value={item.quantity}
                              onChange={e => updateQty(item.product_id, parseInt(e.target.value) || 1)}
                              className="w-14 text-center font-bold text-gray-800 border-2 border-teal-200 rounded-lg py-0.5 outline-none focus:border-teal-500 text-sm" />
                            <button onClick={() => updateQty(item.product_id, item.quantity + 1)}
                              disabled={item.quantity >= item.available}
                              className="w-6 h-6 bg-teal-100 hover:bg-teal-200 disabled:opacity-40 rounded flex items-center justify-center">
                              <span className="text-teal-700 font-bold text-sm leading-none">+</span>
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => removeItem(item.product_id)}
                            className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center">
                            <X className="w-3 h-3 text-red-400" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 bg-teal-50 border-t border-teal-100 flex justify-between text-sm">
                  <span className="font-semibold text-teal-700">{totalItems} units total</span>
                  <span className="text-teal-600">Value: KES {totalValue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. Weekly restocking for main branch..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-400 bg-gray-50 resize-none" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || items.length === 0 || !locationId}
            className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : <><Truck className="w-4 h-4" />Send Transfer</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Transfer Detail Modal ─────────────────────────────────
function TransferDetailModal({ transfer, isOwner, storeName, onAction, onClose }: {
  transfer: Transfer; isOwner: boolean; storeName: string
  onAction: (id: string, action: 'approved' | 'rejected' | 'completed') => void
  onClose: () => void
}) {
  const cfg        = statusConfig[transfer.status] || statusConfig.pending
  const StatusIcon = cfg.icon
  const totalUnits = transfer.stock_transfer_items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = transfer.stock_transfer_items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">{transfer.transfer_number}</h3>
            <p className="text-xs text-gray-400">{new Date(transfer.created_at).toLocaleString('en-KE')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', cfg.color)}>
              <StatusIcon className="w-3 h-3" />{cfg.label}
            </span>
            <button onClick={() => printTransferReceipt(transfer, storeName)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg text-xs font-semibold">
              <Printer className="w-3.5 h-3.5" />Print
            </button>
            <button onClick={onClose} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Destination</p>
              <p className="font-semibold text-gray-800">{transfer.location?.name || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Created By</p>
              <p className="font-semibold text-gray-800">{transfer.creator?.full_name || '—'}</p>
            </div>
            {transfer.approver && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">Approved By</p>
                <p className="font-semibold text-gray-800">{transfer.approver.full_name}</p>
              </div>
            )}
            {transfer.notes && (
              <div className="bg-blue-50 rounded-xl p-3 col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Notes</p>
                <p className="text-sm text-gray-700">{transfer.notes}</p>
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Items ({transfer.stock_transfer_items.length})</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Product</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Unit Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transfer.stock_transfer_items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{item.product_name}</td>
                      <td className="px-3 py-2 text-center font-bold text-teal-700">{item.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-600">KES {item.unit_cost.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-teal-50 border-t border-teal-100">
                  <tr>
                    <td className="px-3 py-2 font-semibold text-teal-700">Total</td>
                    <td className="px-3 py-2 text-center font-black text-teal-700">{totalUnits} units</td>
                    <td className="px-3 py-2 text-right font-semibold text-teal-700">KES {totalValue.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            {transfer.status === 'pending' && (
              <div className="flex gap-3">
                <button onClick={() => { onAction(transfer.id, 'rejected'); onClose() }}
                  className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-sm border border-red-200">✕ Reject</button>
                <button onClick={() => { onAction(transfer.id, 'approved'); onClose() }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm">✓ Approve Transfer</button>
              </div>
            )}
            {transfer.status === 'approved' && (
              <button onClick={() => { onAction(transfer.id, 'completed'); onClose() }}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />Mark as Completed (Stock Moved)
              </button>
            )}
            {(transfer.status === 'completed' || transfer.status === 'rejected') && (
              <p className="text-center text-sm text-gray-400">
                {transfer.status === 'completed' ? '✓ Stock has been moved to branch' : '✕ This transfer was rejected'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stock Adjustment Modal ────────────────────────────────
function StockAdjustModal({ item, onSave, onClose }: { item: StoreStock; onSave: () => void; onClose: () => void }) {
  const [adjType, setAdjType]   = useState<'add' | 'remove' | 'set'>('add')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason]     = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const newQty = (() => {
    const q = parseInt(quantity) || 0
    if (adjType === 'add')    return item.quantity + q
    if (adjType === 'remove') return Math.max(0, item.quantity - q)
    if (adjType === 'set')    return Math.max(0, q)
    return item.quantity
  })()
  const diff = newQty - item.quantity

  const handleSave = async () => {
    if (!quantity || parseInt(quantity) < 0)                        { toast.error('Enter a valid quantity'); return }
    if (!reason.trim())                                              { toast.error('Reason is required'); return }
    if (adjType === 'remove' && parseInt(quantity) > item.quantity) { toast.error('Cannot remove more than current stock'); return }
    setIsSaving(true)
    try {
      const { error } = await supabase.from('store_stock').update({ quantity: newQty }).eq('id', item.id)
      if (error) throw error
      toast.success(`Stock adjusted: ${item.product.name} → ${newQty} units`)
      onSave(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'Adjustment failed')
    } finally { setIsSaving(false) }
  }

  const adjTypes = [
    { id: 'add',    label: 'Add Stock',     desc: 'Found/received extra',  color: 'border-green-400 bg-green-50 text-green-700' },
    { id: 'remove', label: 'Write Off',     desc: 'Damaged/expired/lost',  color: 'border-red-400 bg-red-50 text-red-700' },
    { id: 'set',    label: 'Set Exact Qty', desc: 'Manual stock count',    color: 'border-blue-400 bg-blue-50 text-blue-700' },
  ]
  const reasons = ['Damaged goods', 'Expired stock', 'Stock count correction', 'Theft/loss', 'Supplier bonus', 'Return from branch', 'Other']

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">Adjust Stock</h3>
            <p className="text-xs text-gray-400 truncate max-w-64">{item.product.name}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm text-gray-500">Current Quantity</span>
            <span className="text-2xl font-black text-gray-800">{item.quantity}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Adjustment Type</p>
            <div className="grid grid-cols-3 gap-2">
              {adjTypes.map(t => (
                <button key={t.id} onClick={() => setAdjType(t.id as any)}
                  className={clsx('p-2.5 rounded-xl border-2 text-center transition-all',
                    adjType === t.id ? t.color : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  <p className="text-xs font-bold">{t.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{adjType === 'set' ? 'New Quantity' : 'Quantity'}</label>
            <input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 bg-gray-50" />
          </div>
          {quantity && (
            <div className={clsx('flex items-center justify-between rounded-xl px-4 py-3',
              diff > 0 ? 'bg-green-50 border border-green-200' : diff < 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200')}>
              <span className="text-sm font-medium text-gray-600">New Quantity</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{item.quantity}</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                <span className={clsx('text-xl font-black', diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-gray-700')}>{newQty}</span>
                {diff !== 0 && <span className={clsx('text-xs font-bold', diff > 0 ? 'text-green-600' : 'text-red-600')}>({diff > 0 ? '+' : ''}{diff})</span>}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Reason <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {reasons.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                    reason === r ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                  {r}
                </button>
              ))}
            </div>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Or type a custom reason..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-400 bg-gray-50" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
            <button onClick={handleSave} disabled={isSaving || !quantity || !reason.trim()}
              className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Apply Adjustment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main StorePage ────────────────────────────────────────
export default function StorePage() {
  const { profile } = useAuthStore()
  const isOwner       = profile?.role === 'owner'
  const isStorekeeper = profile?.role === 'storekeeper'

  const [stores, setStores]           = useState<Store[]>([])
  const [activeStore, setActiveStore] = useState<Store | null>(null)
  const [storeStock, setStoreStock]   = useState<StoreStock[]>([])
  const [locations, setLocations]     = useState<Location[]>([])
  const [transfers, setTransfers]     = useState<Transfer[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [stockSearch, setStockSearch] = useState('')
  const [transferSearch, setTransferSearch]   = useState('')
  const [statusFilter, setStatusFilter]       = useState('all')
  const [showNewTransfer, setShowNewTransfer] = useState(false)
  const [showReceiveStock, setShowReceiveStock] = useState(false)
  const [showNewProduct, setShowNewProduct]     = useState(false)
  const [categories, setCategories]             = useState<{id:string;name:string}[]>([])
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null)
  const [activeTab, setActiveTab]               = useState<'stock' | 'transfers'>('stock')
  const [showAdjustModal, setShowAdjustModal]   = useState(false)
  const [adjustingItem, setAdjustingItem]       = useState<StoreStock | null>(null)
  const [lowStockThreshold]                     = useState(10)
  const [showLowStockPanel, setShowLowStockPanel] = useState(true)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [{ data: storeData }, { data: locData }, { data: catData }] = await Promise.all([
        supabase.from('stores').select('*').eq('is_active', true).order('name'),
        supabase.from('locations').select('*').order('name'),
        supabase.from('categories').select('id, name').order('name'),
      ])
      setCategories(catData || [])
      setStores(storeData || [])
      setLocations(locData || [])
      if (storeData && storeData.length > 0) {
        const first = storeData[0]
        setActiveStore(first)
        await fetchStoreData(first.id)
      }
    } finally { setIsLoading(false) }
  }, [])

  const fetchStoreData = async (storeId: string) => {
    const [{ data: stockData }, { data: transferData }] = await Promise.all([
      supabase.from('store_stock').select('id, store_id, product_id, quantity')
        .eq('store_id', storeId).order('quantity', { ascending: false }),
      supabase.from('stock_transfers')
        .select(`*, location:locations(name), creator:profiles!created_by(full_name), approver:profiles!approved_by(full_name), stock_transfer_items(id, product_name, quantity, unit_cost)`)
        .eq('store_id', storeId).order('created_at', { ascending: false }).limit(100),
    ])

    const stockRows = stockData || []
    if (stockRows.length > 0) {
      const productIds = [...new Set(stockRows.map((s: any) => s.product_id))]
      const { data: productData } = await supabase
        .from('products').select('id, name, barcode, selling_price, buying_price').in('id', productIds)
      const productMap: Record<string, any> = {}
      for (const p of (productData || [])) productMap[p.id] = p
      const merged = stockRows.map((s: any) => ({
        ...s,
        product: productMap[s.product_id] || { id: s.product_id, name: 'Unknown', barcode: null, selling_price: 0, buying_price: 0 }
      }))
      setStoreStock(merged as any)
    } else {
      setStoreStock([])
    }
    setTransfers((transferData as any) || [])
  }

  // Keep a ref to activeStore.id so realtime callback always has latest value
  const activeStoreIdRef = useRef<string | null>(null)
  useEffect(() => { activeStoreIdRef.current = activeStore?.id ?? null }, [activeStore])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Realtime: refresh store data whenever tables change ──
  // Both owner and storekeeper get live updates
  useRealtime(
    ['store_stock', 'stock_transfers', 'stock_transfer_items', 'products'],
    () => { if (activeStoreIdRef.current) fetchStoreData(activeStoreIdRef.current) },
    []
  )

  const handleTransferAction = async (transferId: string, action: 'approved' | 'rejected' | 'completed') => {
    try {
      if (action === 'completed') {
        const { error } = await supabase.rpc('complete_stock_transfer', { p_transfer_id: transferId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('stock_transfers')
          .update({ status: action, approved_by: action === 'approved' ? profile?.id : null, approved_at: action === 'approved' ? new Date().toISOString() : null })
          .eq('id', transferId)
        if (error) throw error
      }
      toast.success(`Transfer ${action}!`)
      if (activeStore) await fetchStoreData(activeStore.id)
    } catch (err: any) { toast.error(err.message || 'Action failed') }
  }

  const totalProducts   = storeStock.length
  const totalUnits      = storeStock.reduce((s, i) => s + i.quantity, 0)
  const totalValue      = storeStock.reduce((s, i) => s + i.quantity * i.product.buying_price, 0)
  const pendingCount    = transfers.filter(t => t.status === 'pending').length
  const lowStockItems   = storeStock.filter(s => s.quantity > 0 && s.quantity <= lowStockThreshold)
  const outOfStockItems = storeStock.filter(s => s.quantity === 0)
  const alertCount      = lowStockItems.length + outOfStockItems.length

  const filteredStock = storeStock.filter(s =>
    !stockSearch || s.product.name.toLowerCase().includes(stockSearch.toLowerCase()))
  const filteredTransfers = transfers.filter(t => {
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    const matchSearch = !transferSearch ||
      t.transfer_number.toLowerCase().includes(transferSearch.toLowerCase()) ||
      (t.location?.name || '').toLowerCase().includes(transferSearch.toLowerCase())
    return matchStatus && matchSearch
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>
  )

  if (!isOwner && !isStorekeeper) return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <AlertCircle className="w-12 h-12 mb-3 opacity-40" />
      <p className="font-medium">Access Restricted</p>
      <p className="text-sm mt-1">Only owners and storekeepers can access this page</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Warehouse className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-800">Warehouse / Store</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-400">Manage stock and transfers to branches</p>
              <span className="text-gray-300">·</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-xs text-green-600 font-medium">Live</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => activeStore && fetchStoreData(activeStore.id)}
            className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          {(isOwner || isStorekeeper) && activeStore && storeStock.length > 0 && (
            <button onClick={() => setShowLowStockPanel(true)}
              className={clsx('flex items-center gap-2 px-4 py-2 font-semibold rounded-xl text-sm shadow-sm transition-all',
                alertCount > 0 ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600')}>
              <TriangleAlert className="w-4 h-4" />
              {alertCount > 0 ? `${alertCount} Alerts` : 'No Alerts'}
            </button>
          )}
          {(isOwner || isStorekeeper) && (
            <button onClick={() => setShowNewProduct(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm shadow-sm">
              <Tag className="w-4 h-4" />New Product
            </button>
          )}
          {(isOwner || isStorekeeper) && activeStore && (
            <button onClick={() => setShowReceiveStock(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm shadow-sm">
              <PackagePlus className="w-4 h-4" />Receive Stock
            </button>
          )}
          {(isOwner || isStorekeeper) && activeStore && (
            <button onClick={() => setShowNewTransfer(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm shadow-sm">
              <Truck className="w-4 h-4" />Transfer to Branch
            </button>
          )}
        </div>
      </div>

      {/* Store selector */}
      {stores.length > 1 && (
        <div className="flex gap-2">
          {stores.map(store => (
            <button key={store.id} onClick={() => { setActiveStore(store); fetchStoreData(store.id) }}
              className={clsx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                activeStore?.id === store.id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300')}>
              <Warehouse className="w-3.5 h-3.5 inline mr-1.5" />{store.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-blue-600" /></div>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-semibold">SKUs</span>
          </div>
          <p className="text-2xl font-black text-gray-800">{totalProducts}</p>
          <p className="text-xs text-gray-400 mt-0.5">Unique products</p>
          <p className="text-xs text-gray-500 mt-1">{totalUnits.toLocaleString()} total units</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-semibold">Value</span>
          </div>
          <p className="text-2xl font-black text-gray-800">KES {(totalValue/1000).toFixed(1)}k</p>
          <p className="text-xs text-gray-400 mt-0.5">At buying price</p>
          <p className="text-xs text-gray-500 mt-1">Avg KES {totalProducts > 0 ? Math.round(totalValue / totalProducts).toLocaleString() : 0} / SKU</p>
        </div>
        <div className={clsx('rounded-xl border p-4', alertCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200')}>
          <div className="flex items-start justify-between mb-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', alertCount > 0 ? 'bg-orange-100' : 'bg-gray-50')}>
              <TriangleAlert className={clsx('w-5 h-5', alertCount > 0 ? 'text-orange-600' : 'text-gray-400')} />
            </div>
            {alertCount > 0 && (
              <button onClick={() => setShowLowStockPanel(v => !v)}
                className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full font-semibold hover:bg-orange-200">
                {showLowStockPanel ? 'Hide' : 'View'}
              </button>
            )}
          </div>
          <p className={clsx('text-2xl font-black', alertCount > 0 ? 'text-orange-700' : 'text-gray-400')}>{alertCount}</p>
          <p className={clsx('text-xs mt-0.5', alertCount > 0 ? 'text-orange-600' : 'text-gray-400')}>Stock alerts</p>
          <p className={clsx('text-xs mt-1', alertCount > 0 ? 'text-orange-500' : 'text-gray-400')}>{lowStockItems.length} low · {outOfStockItems.length} out</p>
        </div>
        <div className={clsx('rounded-xl border p-4', pendingCount > 0 ? 'bg-white border-orange-200' : 'bg-white border-gray-200')}>
          <div className="flex items-start justify-between mb-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', pendingCount > 0 ? 'bg-orange-50' : 'bg-gray-50')}>
              <Truck className={clsx('w-5 h-5', pendingCount > 0 ? 'text-orange-500' : 'text-gray-400')} />
            </div>
            {pendingCount > 0 && (
              <button onClick={() => setActiveTab('transfers')}
                className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-semibold hover:bg-orange-100">Review</button>
            )}
          </div>
          <p className={clsx('text-2xl font-black', pendingCount > 0 ? 'text-orange-600' : 'text-gray-400')}>{pendingCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">Pending transfers</p>
          <p className="text-xs text-gray-500 mt-1">{transfers.filter(t => t.status === 'completed').length} completed</p>
        </div>
      </div>

      {/* Low Stock Alerts Panel */}
      {alertCount > 0 && showLowStockPanel && (
        <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TriangleAlert className="w-4 h-4 text-orange-600" />
              <p className="text-sm font-bold text-orange-800">Stock Alerts — {alertCount} product{alertCount !== 1 ? 's' : ''} need attention</p>
            </div>
            <button onClick={() => setShowLowStockPanel(false)} className="text-orange-400 hover:text-orange-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-orange-50">
            {[...outOfStockItems, ...lowStockItems].map(stock => (
              <div key={stock.id} className="px-4 py-3 flex items-center justify-between hover:bg-orange-50/50">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', stock.quantity === 0 ? 'bg-red-100' : 'bg-orange-100')}>
                    <Package className={clsx('w-4 h-4', stock.quantity === 0 ? 'text-red-600' : 'text-orange-600')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{stock.product.name}</p>
                    <p className="text-xs text-gray-400">
                      {stock.product.barcode && <span className="mr-2 font-mono">{stock.product.barcode}</span>}
                      Reorder point: {lowStockThreshold} units
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className={clsx('text-lg font-black', stock.quantity === 0 ? 'text-red-600' : 'text-orange-600')}>{stock.quantity}</span>
                    <p className="text-xs text-gray-400">in stock</p>
                  </div>
                  <span className={clsx('px-2.5 py-1 rounded-full text-xs font-bold', stock.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>
                    {stock.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                  </span>
                  <button onClick={() => { setAdjustingItem(stock); setShowAdjustModal(true) }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-xs font-semibold">
                    <Sliders className="w-3.5 h-3.5" />Adjust
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['stock', 'transfers'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={clsx('px-5 py-2 rounded-lg text-sm font-semibold transition-all',
              activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {tab === 'stock'
              ? <><Package className="w-4 h-4 inline mr-1.5" />Stock Inventory</>
              : <><Truck className="w-4 h-4 inline mr-1.5" />Transfers{pendingCount > 0 && <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center font-black">{pendingCount}</span>}</>
            }
          </button>
        ))}
      </div>

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={stockSearch} onChange={e => setStockSearch(e.target.value)}
                placeholder="Search products in warehouse..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-400" />
            </div>
            <span className="text-xs text-gray-400 shrink-0">{filteredStock.length} products</span>
          </div>
          {filteredStock.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No stock in warehouse</p>
              <p className="text-xs text-gray-300 mt-1">Receive stock or create a product to get started</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Product</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">In Warehouse</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Unit Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Stock Value</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredStock.map(stock => (
                  <tr key={stock.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{stock.product.name}</p>
                      {stock.product.barcode && <p className="text-xs text-gray-400 font-mono">{stock.product.barcode}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx('text-lg font-black',
                        stock.quantity === 0 ? 'text-red-500' : stock.quantity < 10 ? 'text-orange-500' : 'text-teal-600')}>
                        {stock.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">KES {stock.product.buying_price.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-700">KES {(stock.quantity * stock.product.buying_price).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full',
                        stock.quantity === 0 ? 'bg-red-100 text-red-600' : stock.quantity < 10 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600')}>
                        {stock.quantity === 0 ? 'Out of Stock' : stock.quantity < 10 ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { setAdjustingItem(stock); setShowAdjustModal(true) }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 hover:bg-teal-50 text-gray-500 hover:text-teal-700 border border-gray-200 hover:border-teal-300 rounded-lg text-xs font-semibold transition-all">
                        <Sliders className="w-3 h-3" />Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Transfers Tab */}
      {activeTab === 'transfers' && (
        <div className="space-y-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={transferSearch} onChange={e => setTransferSearch(e.target.value)}
                placeholder="Search transfer # or branch..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-400 bg-white" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal-400 bg-white font-medium">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filteredTransfers.length === 0 ? (
              <div className="py-16 text-center">
                <Truck className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No transfers yet</p>
                <p className="text-xs text-gray-300 mt-1">Create a transfer to send stock to a branch</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Transfer #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Destination</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Items</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTransfers.map(transfer => {
                    const cfg = statusConfig[transfer.status] || statusConfig.pending
                    const StatusIcon = cfg.icon
                    const totalQty = transfer.stock_transfer_items.reduce((s, i) => s + i.quantity, 0)
                    return (
                      <tr key={transfer.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg font-semibold">{transfer.transfer_number}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(transfer.created_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-medium text-gray-700">{transfer.location?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 bg-teal-100 text-teal-700 rounded-full text-xs font-bold">{transfer.stock_transfer_items.length}</span>
                          <span className="text-xs text-gray-400 ml-1">({totalQty} units)</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', cfg.color)}>
                            <StatusIcon className="w-3 h-3" />{cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setSelectedTransfer(transfer)}
                            className="w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mx-auto">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewProduct && (
        <NewProductModal categories={categories} store={activeStore}
          onSave={() => { if (activeStore) fetchStoreData(activeStore.id); setShowNewProduct(false) }}
          onClose={() => setShowNewProduct(false)} />
      )}
      {showReceiveStock && activeStore && (
        <ReceiveStockModal store={activeStore}
          onSave={() => fetchStoreData(activeStore.id)}
          onClose={() => setShowReceiveStock(false)} />
      )}
      {showNewTransfer && activeStore && (
        <NewTransferModal store={activeStore} storeStock={storeStock.filter(s => s.quantity > 0)}
          locations={locations}
          onSave={() => fetchStoreData(activeStore.id)}
          onClose={() => setShowNewTransfer(false)} />
      )}
      {showAdjustModal && adjustingItem && (
        <StockAdjustModal item={adjustingItem}
          onSave={() => { if (activeStore) fetchStoreData(activeStore.id) }}
          onClose={() => { setShowAdjustModal(false); setAdjustingItem(null) }} />
      )}
      {selectedTransfer && (
        <TransferDetailModal transfer={selectedTransfer} isOwner={isOwner}
          storeName={activeStore?.name || 'Main Warehouse'}
          onAction={handleTransferAction}
          onClose={() => setSelectedTransfer(null)} />
      )}
    </div>
  )
}