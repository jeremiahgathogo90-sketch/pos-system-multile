import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useRealtime } from '../../hooks/useRealtime'
import {
  Plus, Search, Eye, Truck, Package, X,
  Loader2, RefreshCw, CheckCircle, Clock,
  AlertCircle, XCircle, Trash2
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { Supplier, Product } from '../../types/database'

type POStatus = 'pending' | 'received' | 'partial' | 'cancelled'

interface POItem {
  product_id: string
  product_name: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
}

interface PurchaseOrder {
  id: string
  location_id: string
  supplier_id: string | null
  status: POStatus
  total_amount: number
  amount_paid: number
  notes: string | null
  created_at: string
  supplier?: Supplier
  purchase_order_items?: POItem[]
}

const statusConfig: Record<POStatus, { label: string; color: string; icon: any }> = {
  pending:   { label: 'Pending',   color: 'bg-yellow-100 text-yellow-700', icon: Clock        },
  received:  { label: 'Received',  color: 'bg-green-100 text-green-700',   icon: CheckCircle  },
  partial:   { label: 'Partial',   color: 'bg-blue-100 text-blue-700',     icon: AlertCircle  },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600',       icon: XCircle      },
}

// ── Delete Confirm Modal ─────────────────────────────────
function DeleteConfirmModal({
  order, onConfirm, onClose, isDeleting
}: {
  order: PurchaseOrder
  onConfirm: () => void
  onClose: () => void
  isDeleting: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-5 space-y-4">
          {/* Icon */}
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>

          <div className="text-center">
            <h3 className="font-bold text-gray-800 text-lg">Delete Purchase Order?</h3>
            <p className="text-sm text-gray-500 mt-1">
              This will permanently delete the order from{' '}
              <strong>{order.supplier?.name || 'Unknown Supplier'}</strong> dated{' '}
              <strong>{new Date(order.created_at).toLocaleDateString('en-KE')}</strong>.
            </p>
          </div>

          {/* Order summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total Value</span>
              <span className="font-bold text-gray-800">KES {order.total_amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={clsx('font-semibold px-2 py-0.5 rounded-full text-xs', statusConfig[order.status].color)}>
                {statusConfig[order.status].label}
              </span>
            </div>
          </div>

          {order.status === 'received' && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700">
                <strong>Warning:</strong> This order is marked as received. Deleting it will NOT reverse the stock that was already added to inventory.
              </p>
            </div>
          )}

          <p className="text-xs text-center text-gray-400">This action cannot be undone.</p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isDeleting
                ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</>
                : <><Trash2 className="w-4 h-4" />Delete Order</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create PO Modal ──────────────────────────────────────
function CreatePOModal({
  suppliers, products, locationId, onSave, onClose
}: {
  suppliers: Supplier[]
  products: Product[]
  locationId: string
  onSave: () => void
  onClose: () => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState<{
    product_id: string; product_name: string
    quantity_ordered: number; unit_cost: number
  }[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [isSaving, setIsSaving]           = useState(false)

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
    !items.find(i => i.product_id === p.id)
  )

  const addItem = (product: Product) => {
    setItems(prev => [...prev, {
      product_id: product.id, product_name: product.name,
      quantity_ordered: 1, unit_cost: product.buying_price,
    }])
    setProductSearch('')
  }

  const removeItem = (productId: string) =>
    setItems(prev => prev.filter(i => i.product_id !== productId))

  const updateItem = (productId: string, field: string, value: number) =>
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: value } : i))

  const total = items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0)

  const handleSave = async () => {
    if (items.length === 0) { toast.error('Add at least one product'); return }
    setIsSaving(true)
    try {
      const { data: po, error } = await supabase
        .from('purchase_orders')
        .insert({
          location_id: locationId, supplier_id: supplierId || null,
          status: 'pending', total_amount: total, amount_paid: 0,
          notes: notes || null,
        })
        .select().single()

      if (error) throw error

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(items.map(i => ({
          purchase_order_id: po.id, product_id: i.product_id,
          product_name: i.product_name, quantity_ordered: i.quantity_ordered,
          quantity_received: 0, unit_cost: i.unit_cost,
        })))

      if (itemsError) throw itemsError

      if (supplierId) {
        const { data: supplier } = await supabase
          .from('suppliers').select('outstanding_debt').eq('id', supplierId).single()
        if (supplier) {
          await supabase.from('suppliers')
            .update({ outstanding_debt: supplier.outstanding_debt + total })
            .eq('id', supplierId)
        }
      }

      toast.success('Purchase order created!')
      onSave(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create order')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">New Purchase Order</h3>
            <p className="text-xs text-gray-400">Order products from a supplier</p>
          </div>
          <button onClick={onClose} aria-label="Close purchase order form" ><X className="w-5 h-5 text-gray-400 hover:text-gray-600"/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Supplier <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50"              aria-label="Select supplier for this purchase order">
              <option value="">-- No Supplier / Walk-in Purchase --</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Add Products <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search and add products..."
                value={productSearch} onChange={e => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50" />
              {productSearch && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-10 mt-1 max-h-48 overflow-y-auto">
                  {filteredProducts.slice(0, 8).map(p => (
                    <button key={p.id} onClick={() => addItem(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{p.name}</span>
                      <span className="text-xs text-gray-400">Cost: KES {p.buying_price} · Stock: {p.stock_quantity}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {items.length > 0 ? (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Product</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Qty</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Unit Cost</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Total</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => (
                    <tr key={item.product_id}>
                      <td className="px-4 py-2.5"><p className="font-medium text-gray-800">{item.product_name}</p></td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="1" value={item.quantity_ordered}
                          onChange={e => updateItem(item.product_id, 'quantity_ordered', parseInt(e.target.value) || 1)}
                          className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-400 mx-auto block"
                          aria-label="Update quantity ordered for this item" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" step="0.01" value={item.unit_cost}
                          onChange={e => updateItem(item.product_id, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-400 ml-auto block"
                          aria-label="Update unit cost for this item" />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                        KES {(item.quantity_ordered * item.unit_cost).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => removeItem(item.product_id)} aria-label={`Remove ${item.product_name} from order`}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-right font-bold text-gray-700 text-sm">Total Order Value</td>
                    <td className="px-4 py-2.5 text-right font-black text-blue-600 text-base">KES {total.toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center text-gray-300">
              <Package className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">Search and add products above</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Delivery instructions, reference numbers, etc."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-gray-50 resize-none" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || items.length === 0}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── View/Receive PO Modal ────────────────────────────────
function ViewPOModal({ order, onUpdate, onClose }: {
  order: PurchaseOrder; onUpdate: () => void; onClose: () => void
}) {
  const [items, setItems]               = useState<any[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [isSaving, setIsSaving]         = useState(false)
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})

  useEffect(() => { fetchItems() }, [order.id])

  const fetchItems = async () => {
    const { data } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', order.id)
    setItems(data || [])
    const qtys: Record<string, number> = {}
    data?.forEach(i => { qtys[i.id] = i.quantity_received })
    setReceivedQtys(qtys)
    setIsLoading(false)
  }

  const handleReceive = async () => {
    setIsSaving(true)
    try {
      for (const item of items) {
        const newQty = receivedQtys[item.id] || 0
        if (newQty !== item.quantity_received) {
          await supabase.from('purchase_order_items').update({ quantity_received: newQty }).eq('id', item.id)
        }
      }
      const allReceived = items.every(i => (receivedQtys[i.id] || 0) >= i.quantity_ordered)
      const anyReceived = items.some(i => (receivedQtys[i.id] || 0) > 0)
      const newStatus   = allReceived ? 'received' : anyReceived ? 'partial' : 'pending'
      await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', order.id)
      toast.success('Stock updated successfully!')
      onUpdate(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel this purchase order?')) return
    await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', order.id)
    toast.success('Order cancelled')
    onUpdate(); onClose()
  }

  const cfg = statusConfig[order.status]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-gray-800 text-lg">Purchase Order</h3>
              <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-bold', cfg.color)}>{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {order.supplier?.name || 'No Supplier'} · {new Date(order.created_at).toLocaleDateString('en-KE')}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close purchase order form" ><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-600 font-medium">Total Value</p>
              <p className="text-lg font-black text-blue-700">KES {order.total_amount.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-green-600 font-medium">Amount Paid</p>
              <p className="text-lg font-black text-green-700">KES {order.amount_paid.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-red-600 font-medium">Balance Due</p>
              <p className="text-lg font-black text-red-700">KES {(order.total_amount - order.amount_paid).toLocaleString()}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Product</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Ordered</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Received</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Unit Cost</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => {
                    const isFullyReceived = (receivedQtys[item.id] || 0) >= item.quantity_ordered
                    return (
                      <tr key={item.id} className={clsx(isFullyReceived && 'bg-green-50/50')}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isFullyReceived && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                            <span className="font-medium text-gray-800">{item.product_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold text-gray-700">{item.quantity_ordered}</td>
                        <td className="px-4 py-2.5 text-center">
                          {order.status === 'received' || order.status === 'cancelled' ? (
                            <span className="font-semibold text-gray-700">{item.quantity_received}</span>
                          ) : (
                            <input type="number" min="0" max={item.quantity_ordered}
                              value={receivedQtys[item.id] || 0}
                              onChange={e => setReceivedQtys(prev => ({
                                ...prev, [item.id]: Math.min(parseInt(e.target.value) || 0, item.quantity_ordered)
                              }))}
                              className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-400 mx-auto block"
                              aria-label={`Update quantity received for ${item.product_name}`} />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">KES {item.unit_cost.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                          KES {(item.quantity_ordered * item.unit_cost).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {order.notes && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          {order.status === 'pending' || order.status === 'partial' ? (
            <>
              <button onClick={handleCancel}
                className="px-4 py-2.5 border border-red-200 text-red-500 font-semibold rounded-xl hover:bg-red-50 text-sm">
                Cancel Order
              </button>
              <button onClick={handleReceive} disabled={isSaving}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Updating...</> : <><CheckCircle className="w-4 h-4" />Update Received Stock</>}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm">Close</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────
export default function PurchasesPage() {
  const { profile } = useAuthStore()
  const [orders, setOrders]             = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers]       = useState<Supplier[]>([])
  const [products, setProducts]         = useState<Product[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null)

  // Delete state
  const [deletingOrder, setDeletingOrder]   = useState<PurchaseOrder | null>(null)
  const [isDeleting, setIsDeleting]         = useState(false)

  const isCrossBranch = profile?.role === 'owner' || profile?.role === 'accountant'

  const fetchOrders = useCallback(async () => {
    let q = supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(id,name,phone)')
      .order('created_at', { ascending: false })
    if (!isCrossBranch) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setOrders((data || []) as PurchaseOrder[])
  }, [isCrossBranch, profile?.location_id])

  const fetchSuppliers = useCallback(async () => {
    let q = supabase.from('suppliers').select('*').order('name')
    if (!isCrossBranch) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setSuppliers(data || [])
  }, [isCrossBranch, profile?.location_id])

  const fetchProducts = useCallback(async () => {
    let q = supabase.from('products').select('*').eq('is_active', true).order('name')
    if (!isCrossBranch) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setProducts(data || [])
  }, [isCrossBranch, profile?.location_id])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchOrders(), fetchSuppliers(), fetchProducts()])
    setIsLoading(false)
  }, [fetchOrders, fetchSuppliers, fetchProducts])

  useEffect(() => { fetchAll() }, [fetchAll])

  useRealtime(['purchase_orders', 'purchase_order_items'], fetchOrders, [profile?.location_id])

  // ── Delete handler ──
  const handleDeleteConfirm = async () => {
    if (!deletingOrder) return
    setIsDeleting(true)
    try {
      // Items are cascade-deleted via FK constraint
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', deletingOrder.id)

      if (error) throw error

      // If there was a supplier debt from this order, reverse it
      if (deletingOrder.supplier_id && deletingOrder.status !== 'received') {
        const { data: supplier } = await supabase
          .from('suppliers').select('outstanding_debt').eq('id', deletingOrder.supplier_id).single()
        if (supplier) {
          const newDebt = Math.max(0, supplier.outstanding_debt - deletingOrder.total_amount)
          await supabase.from('suppliers').update({ outstanding_debt: newDebt }).eq('id', deletingOrder.supplier_id)
        }
      }

      toast.success('Purchase order deleted')
      setDeletingOrder(null)
      fetchAll()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete order')
    } finally {
      setIsDeleting(false)
    }
  }

  const filtered = orders.filter(o => {
    const matchSearch = (o.supplier?.name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalOrders    = orders.length
  const pendingOrders  = orders.filter(o => o.status === 'pending').length
  const totalValue     = orders.reduce((s, o) => s + o.total_amount, 0)
  const totalUnpaid    = orders.reduce((s, o) => s + (o.total_amount - o.amount_paid), 0)

  const canDelete = profile?.role === 'owner' || profile?.role === 'admin'

  return (
    <div className="p-6 space-y-5">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders',  value: totalOrders,                                icon: Package,      color: 'bg-blue-600',   sub: 'All purchase orders' },
          { label: 'Pending',       value: pendingOrders,                              icon: Clock,        color: pendingOrders > 0 ? 'bg-yellow-500' : 'bg-green-600', sub: 'Awaiting delivery' },
          { label: 'Total Value',   value: `KES ${(totalValue/1000).toFixed(1)}k`,     icon: Truck,        color: 'bg-purple-600', sub: 'All orders combined' },
          { label: 'Amount Owed',   value: `KES ${(totalUnpaid/1000).toFixed(1)}k`,    icon: AlertCircle,  color: totalUnpaid > 0 ? 'bg-red-500' : 'bg-green-600', sub: 'Unpaid to suppliers' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
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

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by supplier..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 text-gray-700"           aria-label="Filter purchase orders by status">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={fetchAll} className="px-3 py-2 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50"
                      aria-label="Refresh purchase orders list">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl">
            <Plus className="w-4 h-4" />New Order
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-400">Loading orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Truck className="w-14 h-14 mb-3" />
            <p className="text-base font-medium text-gray-400">No purchase orders yet</p>
            <button onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" />New Order
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Date', 'Supplier', 'Items', 'Total Value', 'Paid', 'Balance', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(order => {
                  const cfg        = statusConfig[order.status]
                  const StatusIcon = cfg.icon
                  const balance    = order.total_amount - order.amount_paid

                  return (
                    <tr key={order.id}
                      className="hover:bg-gray-50 transition-colors group cursor-pointer"
                      onClick={() => setViewingOrder(order)}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">
                          {new Date(order.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(order.created_at).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {order.supplier
                          ? <div><p className="text-sm font-semibold text-gray-800">{order.supplier.name}</p>{order.supplier.phone && <p className="text-xs text-gray-400">{order.supplier.phone}</p>}</div>
                          : <span className="text-xs text-gray-400 italic">No Supplier</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {(order as any).purchase_order_items?.length || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-800">KES {order.total_amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-green-600 font-semibold">KES {order.amount_paid.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {balance > 0
                          ? <span className="text-sm font-bold text-red-600">KES {balance.toLocaleString()}</span>
                          : <span className="text-sm text-green-600 font-semibold">Paid</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.color)}>
                          <StatusIcon className="w-3 h-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* View button */}
                          <button
                            onClick={e => { e.stopPropagation(); setViewingOrder(order) }}
                            title="View order"
                            className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {/* Delete button — owner/admin only */}
                          {canDelete && (
                            <button
                              onClick={e => { e.stopPropagation(); setDeletingOrder(order) }}
                              title="Delete order"
                              className="w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-lg flex items-center justify-center transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-between text-xs text-gray-500">
              <span>{filtered.length} orders</span>
              <span>Total value: <strong className="text-gray-700">KES {filtered.reduce((s, o) => s + o.total_amount, 0).toLocaleString()}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreatePOModal
          suppliers={suppliers} products={products}
          locationId={profile?.location_id || ''}
          onSave={fetchAll} onClose={() => setShowCreateModal(false)}
        />
      )}

      {viewingOrder && (
        <ViewPOModal order={viewingOrder} onUpdate={fetchAll} onClose={() => setViewingOrder(null)} />
      )}

      {deletingOrder && (
        <DeleteConfirmModal
          order={deletingOrder}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeletingOrder(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}