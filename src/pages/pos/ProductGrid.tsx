import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { usePOSStore } from '../../store/posStore'
import type { Product, Category } from '../../types/database'
import { Search, Package } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

export default function ProductGrid() {
  const { profile } = useAuthStore()
  const { addToCart } = usePOSStore()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [])

  const fetchProducts = async () => {
    let query = supabase
      .from('products')
      .select('*, category:categories(id, name)')
      .eq('is_active', true)
      .order('name')

    if (profile?.role !== 'owner') {
      query = query.eq('location_id', profile?.location_id)
    }

    const { data } = await query
    setProducts(data || [])
    setIsLoading(false)
  }

  const fetchCategories = async () => {
    let query = supabase.from('categories').select('*').order('name')
    if (profile?.role !== 'owner') {
      query = query.eq('location_id', profile?.location_id)
    }
    const { data } = await query
    setCategories(data || [])
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search)
    const matchCategory = selectedCategory === 'all' || p.category_id === selectedCategory
    return matchSearch && matchCategory
  })

  const handleAddToCart = (product: Product) => {
    if (product.stock_quantity <= 0) {
      toast.error('Product is out of stock')
      return
    }
    addToCart({
      product_id: product.id,
      product_name: product.name,
      unit_price: product.selling_price,
      quantity: 1,
      total_price: product.selling_price,
      stock_quantity: product.stock_quantity,
    })
    toast.success(`${product.name} added`, { duration: 800 })
  }

  return (
    <div className="flex flex-col h-full">

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products or scan barcode..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 
              rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 
              focus:ring-blue-100 transition-all"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100 shrink-0">
        <button
          onClick={() => setSelectedCategory('all')}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          All Products
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
              selectedCategory === cat.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-xl h-28 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-300">
            <Package className="w-10 h-10 mb-2" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map(product => (
              <button
                key={product.id}
                onClick={() => handleAddToCart(product)}
                disabled={product.stock_quantity <= 0}
                className={clsx(
                  'text-left p-3 rounded-xl border transition-all duration-150',
                  product.stock_quantity <= 0
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 cursor-pointer'
                )}
              >
                {/* Product icon placeholder */}
                <div className="w-full h-14 bg-gradient-to-br from-blue-50 to-blue-100 
                  rounded-lg mb-2 flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
                  {product.name}
                </p>
                <p className="text-xs text-blue-600 font-bold mt-0.5">
                  KES {product.selling_price.toLocaleString()}
                </p>
                <p className={clsx(
                  'text-xs mt-0.5',
                  product.stock_quantity <= 10 ? 'text-orange-500' : 'text-gray-400'
                )}>
                  Stock: {product.stock_quantity}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}