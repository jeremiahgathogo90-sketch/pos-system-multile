export type UserRole = 'owner' | 'admin' | 'accountant' | 'cashier'
export type PaymentMethod = 'cash' | 'card' | 'credit' | 'mobile_money'
export type POStatus = 'pending' | 'received' | 'partial' | 'cancelled'

export interface Location {
  id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  location_id: string | null
  is_active: boolean
  created_at: string
  location?: Location
}

export interface Category {
  id: string
  location_id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  location_id: string
  category_id: string | null
  name: string
  barcode: string | null
  buying_price: number
  selling_price: number
  stock_quantity: number
  unit: string
  is_active: boolean
  created_at: string
  updated_at: string
  category?: Category
}

export interface Customer {
  id: string
  location_id: string
  name: string
  phone: string | null
  email: string | null
  credit_limit: number
  outstanding_balance: number
  notes: string | null
  created_at: string
}

export interface Supplier {
  id: string
  location_id: string
  name: string
  phone: string | null
  email: string | null
  outstanding_debt: number
  notes: string | null
  created_at: string
}

export interface Sale {
  id: string
  location_id: string
  cashier_id: string
  customer_id: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  payment_method: PaymentMethod
  amount_paid: number | null
  change_given: number
  notes: string | null
  created_at: string
  cashier?: Profile
  customer?: Customer
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
}

export interface CartItem {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  total_price: number
  stock_quantity: number
}

export interface SuspendedOrder {
  id: string
  location_id: string
  cashier_id: string
  label: string | null
  cart_data: CartItem[]
  created_at: string
}

export interface StoreSettings {
  id: string
  location_id: string
  store_name: string
  currency: string
  tax_rate: number
  low_stock_threshold: number
  receipt_footer: string | null
  updated_at: string
}

// Database type for Supabase client (simplified)
export type Database = any