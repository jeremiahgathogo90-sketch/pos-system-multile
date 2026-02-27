import { useState, useMemo } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { useAuthStore } from '../../store/authStore'
import ProductModal from './ProductModal'
import CategoryModal from './CategoryModal'
import ImportModal from './ImportModal'
import {
  Plus, Search, Download, Upload, Tag,
  Edit2, Trash2, AlertTriangle, Package,
  TrendingUp, DollarSign, RefreshCw,
  ChevronUp, ChevronDown
} from 'lucide-react'
import { clsx } from 'clsx'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import type { Product } from '../../types/database'

type SortKey = 'name' | 'selling_price' | 'stock_quantity' | 'buying_price'
type SortDir = 'asc' | 'desc'

export default function InventoryPage() {
  const { profile } = useAuthStore()
  const {
    products, categories, isLoading,
    addProduct, updateProduct, deleteProduct,
    addCategory, bulkImport, fetchProducts
  } = useInventory()

  const canEdit = ['owner', 'admin', 'accountant'].includes(profile?.role || '')

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Modals
  const [showProductModal, setShowProductModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtered + sorted products
  const filtered = useMemo(() => {
    return products
      .filter(p => {
        const matchSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode || '').includes(search)
        const matchCat = categoryFilter === 'all' || p.category_id === categoryFilter
        const matchStock =
          stockFilter === 'all' ? true :
          stockFilter === 'out' ? p.stock_quantity === 0 :
          p.stock_quantity > 0 && p.stock_quantity <= 10
        return matchSearch && matchCat && matchStock
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? 0
        const bv = b[sortKey] ?? 0
        const cmp = typeof av === 'string'
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number)
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [products, search, categoryFilter, stockFilter, sortKey, sortDir])

  // Summary metrics
  const totalValue = products.reduce((s, p) => s + p.selling_price * p.stock_quantity, 0)
  const totalCost = products.reduce((s, p) => s + p.buying_price * p.stock_quantity, 0)
  const lowStockCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 10).length
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-500" />
      : <ChevronDown className="w-3 h-3 text-blue-500" />
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await deleteProduct(id)
    } finally {
      setDeletingId(null)
    }
  }

  const handleExport = () => {
    const rows = products.map(p => ({
      name: p.name,
      barcode: p.barcode || '',
      category: (p as any).category?.name || '',
      buying_price: p.buying_price,
      selling_price: p.selling_price,
      stock_quantity: p.stock_quantity,
      unit: p.unit,
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${products.length} products`)
  }

  return (
    <div className="space-y-5">

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Products', value: products.length,
            icon: Package, color: 'blue', sub: `${filtered.length} showing`
          },
          {
            label: 'Stock Value', value: `KES ${(totalValue / 1000).toFixed(1)}k`,
            icon: DollarSign, color: 'green', sub: `Cost: KES ${(totalCost / 1000).toFixed(1)}k`
          },
          {
            label: 'Low Stock', value: lowStockCount,
            icon: AlertTriangle, color: lowStockCount > 0 ? 'yellow' : 'green',
            sub: '≤ 10 units remaining'
          },
          {
            label: 'Out of Stock', value: outOfStockCount,
            icon: TrendingUp, color: outOfStockCount > 0 ? 'red' : 'green',
            sub: 'Needs restocking'
          },
        ].map(card => {
          const colors: Record<string, string> = {
            blue: 'bg-blue-600', green: 'bg-green-600',
            yellow: 'bg-yellow-500', red: 'bg-red-500'
          }
          return (
            <div key={card.label}
              className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
                </div>
                <div className={`w-10 h-10 ${colors[card.color]} rounded-xl flex items-center justify-center`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">

          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products or barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl 
                text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 text-gray-700" aria-label="Select category filter">
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={e => setStockFilter(e.target.value as any)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 text-gray-700" aria-label="Select stock level filter">
              <option value="all">All Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>

          {/* Action Buttons */}
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 
                  text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                <Tag className="w-3.5 h-3.5" />
                Categories
              </button>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 
                  text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <button onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 
                  text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Import CSV
              </button>
              <button onClick={() => { setEditingProduct(null); setShowProductModal(true) }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                  text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
                Add Product
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Products Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
          </p>
          <button onClick={fetchProducts}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="h-4 bg-gray-200 rounded w-48" />
                  <div className="h-4 bg-gray-200 rounded w-24" />
                  <div className="h-4 bg-gray-200 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Package className="w-14 h-14 mb-3" />
            <p className="text-base font-medium text-gray-400">No products found</p>
            <p className="text-sm text-gray-300 mt-1">
              {search ? 'Try a different search term' : 'Add your first product to get started'}
            </p>
            {canEdit && !search && (
              <button
                onClick={() => { setEditingProduct(null); setShowProductModal(true) }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold 
                  rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {[
                    { label: 'Product', key: 'name' },
                    { label: 'Category', key: null },
                    { label: 'Buying Price', key: 'buying_price' },
                    { label: 'Selling Price', key: 'selling_price' },
                    { label: 'Stock', key: 'stock_quantity' },
                    { label: 'Unit', key: null },
                    { label: 'Status', key: null },
                    { label: '', key: null },
                  ].map(col => (
                    <th key={col.label}
                      onClick={() => col.key && handleSort(col.key as SortKey)}
                      className={clsx(
                        'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide',
                        col.key && 'cursor-pointer hover:text-gray-700 select-none'
                      )}>
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.key && <SortIcon k={col.key as SortKey} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(product => {
                  const margin = product.selling_price > 0
                    ? ((product.selling_price - product.buying_price) / product.selling_price * 100).toFixed(0)
                    : 0

                  return (
                    <tr key={product.id}
                      className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                          {product.barcode && (
                            <p className="text-xs text-gray-400 font-mono">{product.barcode}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(product as any).category?.name ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs 
                            font-medium rounded-full">
                            {(product as any).category.name}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        KES {product.buying_price.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            KES {product.selling_price.toLocaleString()}
                          </p>
                          <p className="text-xs text-green-600 font-medium">{margin}% margin</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'text-sm font-bold',
                          product.stock_quantity === 0 ? 'text-red-600' :
                          product.stock_quantity <= 10 ? 'text-orange-500' : 'text-gray-800'
                        )}>
                          {product.stock_quantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{product.unit}</td>
                      <td className="px-4 py-3">
                        {product.stock_quantity === 0 ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-semibold rounded-full">
                            Out of Stock
                          </span>
                        ) : product.stock_quantity <= 10 ? (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingProduct(product); setShowProductModal(true) }} 
                              className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 
                                rounded-lg flex items-center justify-center transition-colors"
                              aria-label="Edit product">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              disabled={deletingId === product.id}
                              className="w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 
                                rounded-lg flex items-center justify-center transition-colors
                                disabled:opacity-50" aria-label="Delete product">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center 
            justify-between text-xs text-gray-500">
            <span>{filtered.length} products · Stock value: <strong className="text-gray-700">
              KES {filtered.reduce((s, p) => s + p.selling_price * p.stock_quantity, 0).toLocaleString()}
            </strong></span>
            <span>Total units: <strong className="text-gray-700">
              {filtered.reduce((s, p) => s + p.stock_quantity, 0).toLocaleString()}
            </strong></span>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showProductModal && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onSave={editingProduct
            ? (data) => updateProduct(editingProduct.id, data)
            : addProduct
          }
          onClose={() => { setShowProductModal(false); setEditingProduct(null) }}
        />
      )}

      {showCategoryModal && (
        <CategoryModal
          categories={categories}
          onAdd={addCategory}
          onClose={() => setShowCategoryModal(false)}
        />
      )}

      {showImportModal && (
        <ImportModal
          categories={categories}
          onImport={bulkImport}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  )
}