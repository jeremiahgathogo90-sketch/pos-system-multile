import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Customer } from '../types/database'

export interface CartItem {
  product_id:     string
  product_name:   string
  unit_price:     number
  selling_price:  number   // retail price — cannot sell below this
  quantity:       number
  total_price:    number
  stock_quantity: number
}

interface POSState {
  cart:             CartItem[]
  selectedCustomer: Customer | null
  discount:         number
  taxRate:          number   // fetched from store_settings, e.g. 0.16 for 16%

  // Actions
  addToCart:       (item: CartItem) => void
  removeFromCart:  (productId: string) => void
  updateQuantity:  (productId: string, qty: number) => void
  clearCart:       () => void
  setCustomer:     (customer: Customer | null) => void
  setDiscount:     (amount: number) => void
  setTaxRate:      (rate: number) => void
  fetchTaxRate:    (locationId: string | null) => Promise<void>

  // Computed
  getSubtotal: () => number
  getTax:      () => number
  getTotal:    () => number
}

export const usePOSStore = create<POSState>()((set, get) => ({
  cart:             [],
  selectedCustomer: null,
  discount:         0,
  taxRate:          0,   // default 0 until loaded from DB

  addToCart: (item) => {
    set(state => {
      const existing = state.cart.find(i => i.product_id === item.product_id)
      if (existing) {
        return {
          cart: state.cart.map(i =>
            i.product_id === item.product_id
              ? { ...i, quantity: i.quantity + item.quantity, total_price: i.unit_price * (i.quantity + item.quantity) }
              : i
          ),
        }
      }
      return { cart: [...state.cart, item] }
    })
  },

  removeFromCart: (productId) =>
    set(state => ({ cart: state.cart.filter(i => i.product_id !== productId) })),

  updateQuantity: (productId, qty) => {
    if (qty <= 0) {
      get().removeFromCart(productId)
      return
    }
    set(state => ({
      cart: state.cart.map(i =>
        i.product_id === productId
          ? { ...i, quantity: qty, total_price: i.unit_price * qty }
          : i
      ),
    }))
  },

  clearCart: () => set({ cart: [], selectedCustomer: null, discount: 0 }),

  setCustomer: (customer) => set({ selectedCustomer: customer }),

  setDiscount: (amount) => set({ discount: amount }),

  setTaxRate: (rate) => set({ taxRate: rate }),

  // Fetches tax_rate from store_settings for the given location
  fetchTaxRate: async (locationId) => {
    try {
      let query = supabase
        .from('store_settings')
        .select('tax_rate')

      if (locationId) {
        query = query.eq('location_id', locationId)
      }

      const { data, error } = await query.limit(1).single()

      if (error || !data) {
        // If no settings found, default to 0 (no tax)
        set({ taxRate: 0 })
        return
      }

      // tax_rate in DB is stored as percentage (e.g. 16), convert to decimal (0.16)
      const rate = (data.tax_rate || 0) / 100
      set({ taxRate: rate })
    } catch {
      set({ taxRate: 0 })
    }
  },

  getSubtotal: () => {
    const { cart, discount } = get()
    const raw = cart.reduce((sum, item) => sum + item.total_price, 0)
    return Math.max(0, raw - discount)
  },

  getTax: () => {
    const { taxRate, getSubtotal } = get()
    if (!taxRate || taxRate <= 0) return 0
    return getSubtotal() * taxRate
  },

  getTotal: () => {
    const { getSubtotal, getTax } = get()
    return getSubtotal() + getTax()
  },
}))