import { useState } from 'react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'
import {
  Trash2, Plus, Minus, ShoppingCart,
  User, Banknote, CreditCard, Smartphone, X
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { Customer } from '../../types/database'

const paymentMethods = [
  { id: 'cash', label: 'Cash', icon: Banknote, color: 'bg-green-500' },
  { id: 'card', label: 'Card', icon: CreditCard, color: 'bg-blue-500' },
  { id: 'mobile_money', label: 'M-Pesa', icon: Smartphone, color: 'bg-purple-500' },
  { id: 'credit', label: 'Credit', icon: User, color: 'bg-orange-500' },
]

export default function Cart() {
  const { profile } = useAuthStore()
  const {
    cart, removeFromCart, updateQuantity, clearCart,
    selectedCustomer, setCustomer,
    discount, setDiscount,
    getSubtotal, getTax, getTotal
  } = usePOSStore()

  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)

  const subtotal = getSubtotal()
  const tax = getTax()
  const total = getTotal()
  const change = parseFloat(amountPaid) - total

  const searchCustomers = async (query: string) => {
    setCustomerSearch(query)
    if (query.length < 2) { setCustomers([]); return }

    let q = supabase.from('customers').select('*')
      .ilike('name', `%${query}%`).limit(5)

    if (profile?.role !== 'owner') {
      q = q.eq('location_id', profile?.location_id)
    }

    const { data } = await q
    setCustomers(data || [])
  }

  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    if (paymentMethod === 'credit' && !selectedCustomer) {
      toast.error('Select a customer for credit sales'); return
    }
    if (paymentMethod === 'cash' && parseFloat(amountPaid) < total) {
      toast.error('Amount paid is less than total'); return
    }

    setIsProcessing(true)
    try {
      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          location_id: profile?.location_id || profile?.location?.id,
          cashier_id: profile?.id,
          customer_id: selectedCustomer?.id || null,
          subtotal,
          tax_amount: tax,
          discount_amount: discount,
          total_amount: total,
          payment_method: paymentMethod,
          amount_paid: paymentMethod === 'cash' ? parseFloat(amountPaid) : total,
          change_given: paymentMethod === 'cash' ? Math.max(0, change) : 0,
        })
        .select()
        .single()

      if (saleError) throw saleError

      // Insert sale items
      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }))

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems)

      if (itemsError) throw itemsError

      toast.success(`Sale completed! ${paymentMethod === 'cash' && change > 0 ? `Change: KES ${change.toFixed(0)}` : ''}`)
      clearCart()
      setAmountPaid('')
      setPaymentMethod('cash')

    } catch (err: any) {
      toast.error(err.message || 'Checkout failed')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Cart</h3>
          {cart.length > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 
              flex items-center justify-center font-bold">
              {cart.length}
            </span>
          )}
        </div>
        {cart.length > 0 && (
          <button onClick={clearCart}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Customer Selector */}
      <div className="px-4 py-3 border-b border-gray-100">
        {selectedCustomer ? (
          <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-xs font-semibold text-blue-800">{selectedCustomer.name}</p>
                <p className="text-xs text-blue-500">Balance: KES {selectedCustomer.outstanding_balance.toLocaleString()}</p>
              </div>
            </div>
            <button onClick={() => { setCustomer(null); setShowCustomerSearch(false) }}>
              <X className="w-4 h-4 text-blue-400 hover:text-blue-600" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 
              rounded-xl px-3 py-2 cursor-pointer"
              onClick={() => setShowCustomerSearch(true)}>
              <User className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customer (optional)..."
                value={customerSearch}
                onChange={e => searchCustomers(e.target.value)}
                onFocus={() => setShowCustomerSearch(true)}
                className="flex-1 bg-transparent text-xs outline-none text-gray-600"
              />
            </div>
            {showCustomerSearch && customers.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 
                rounded-xl shadow-lg z-10 mt-1 overflow-hidden">
                {customers.map(c => (
                  <button key={c.id}
                    onClick={() => {
                      setCustomer(c)
                      setShowCustomerSearch(false)
                      setCustomerSearch('')
                      setCustomers([])
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs">
                    <p className="font-medium text-gray-800">{c.name}</p>
                    <p className="text-gray-400">{c.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 py-8">
            <ShoppingCart className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs mt-1">Click products to add them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.product_id}
                className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{item.product_name}</p>
                  <p className="text-xs text-blue-600">KES {item.unit_price.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-lg flex items-center 
                      justify-center transition-colors">
                    <Minus className="w-3 h-3 text-gray-600" />
                  </button>
                  <span className="text-sm font-bold text-gray-800 w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                    disabled={item.quantity >= item.stock_quantity}
                    className="w-6 h-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 
                      rounded-lg flex items-center justify-center transition-colors">
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                  <button onClick={() => removeFromCart(item.product_id)}
                    className="w-6 h-6 bg-red-100 hover:bg-red-200 rounded-lg flex items-center 
                      justify-center ml-1 transition-colors">
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + Checkout */}
      {cart.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3">

          {/* Discount */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 shrink-0">Discount</label>
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">KES</span>
              <input
                type="number"
                min="0"
                max={subtotal}
                value={discount || ''}
                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full pl-10 pr-3 py-1.5 bg-gray-50 border border-gray-200 
                  rounded-lg text-xs outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal</span>
              <span>KES {subtotal.toLocaleString()}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs text-green-600">
                <span>Discount</span>
                <span>- KES {discount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-500">
              <span>Tax (16%)</span>
              <span>KES {tax.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-gray-800 
              pt-1.5 border-t border-gray-200">
              <span>Total</span>
              <span className="text-blue-600">KES {total.toFixed(0)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="grid grid-cols-4 gap-1.5">
            {paymentMethods.map(pm => (
              <button key={pm.id}
                onClick={() => setPaymentMethod(pm.id)}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium transition-all',
                  paymentMethod === pm.id
                    ? `${pm.color} text-white shadow-sm`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}>
                <pm.icon className="w-3.5 h-3.5" />
                {pm.label}
              </button>
            ))}
          </div>

          {/* Amount paid (cash only) */}
          {paymentMethod === 'cash' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-20 shrink-0">Amount Paid</label>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">KES</span>
                <input
                  type="number"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder={total.toFixed(0)}
                  className="w-full pl-10 pr-3 py-1.5 bg-gray-50 border border-gray-200 
                    rounded-lg text-xs outline-none focus:border-blue-400"
                />
              </div>
            </div>
          )}

          {/* Change */}
          {paymentMethod === 'cash' && parseFloat(amountPaid) > 0 && (
            <div className={clsx(
              'flex justify-between text-sm font-bold px-3 py-2 rounded-xl',
              change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            )}>
              <span>{change >= 0 ? 'Change' : 'Shortage'}</span>
              <span>KES {Math.abs(change).toFixed(0)}</span>
            </div>
          )}

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300
              text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200
              hover:shadow-xl hover:-translate-y-0.5 disabled:transform-none
              disabled:cursor-not-allowed text-sm"
          >
            {isProcessing ? 'Processing...' : `Complete Sale · KES ${total.toFixed(0)}`}
          </button>
        </div>
      )}
    </div>
  )
}