import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2 } from 'lucide-react'
import type { Product, Category } from '../../types/database'

const schema = z.object({
  name: z.string().min(1, 'Product name is required'),
  barcode: z.string().optional(),
  category_id: z.string().optional(),
  buying_price: z.coerce.number().min(0, 'Must be 0 or more'),
  selling_price: z.coerce.number().min(0.01, 'Must be greater than 0'),
  stock_quantity: z.coerce.number().int().min(0),
  unit: z.string().min(1, 'Unit is required'),
})

type FormData = z.infer<typeof schema>

interface Props {
  product?: Product | null
  categories: Category[]
  onSave: (data: Partial<Product>) => Promise<void>
  onClose: () => void
}

const units = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'dozen', 'pack', 'bag', 'roll']

export default function ProductModal({ product, categories, onSave, onClose }: Props) {
  const [isSaving, setIsSaving] = useState(false)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name || '',
      barcode: product?.barcode || '',
      category_id: product?.category_id || '',
      buying_price: product?.buying_price || 0,
      selling_price: product?.selling_price || 0,
      stock_quantity: product?.stock_quantity || 0,
      unit: product?.unit || 'pcs',
    }
  })

  const onSubmit = async (data: FormData) => {
    setIsSaving(true)
    try {
      await onSave({
        ...data,
        category_id: data.category_id || null,
        barcode: data.barcode || null,
      })
      onClose()
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const Field = ({ label, error, children }: any) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )

  const inputClass = (hasError?: boolean) =>
    `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all ${
      hasError
        ? 'border-red-400 bg-red-50'
        : 'border-gray-200 bg-gray-50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white'
    }`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 
          flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">
              {product ? 'Edit Product' : 'Add New Product'}
            </h3>
            <p className="text-xs text-gray-400">
              {product ? 'Update product details' : 'Fill in the product information'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 
              flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">

          {/* Name */}
          <Field label="Product Name *" error={errors.name?.message}>
            <input {...register('name')} className={inputClass(!!errors.name)}
              placeholder="e.g. Coca Cola 500ml" />
          </Field>

          {/* Barcode */}
          <Field label="Barcode / SKU" error={errors.barcode?.message}>
            <input {...register('barcode')} className={inputClass()}
              placeholder="Scan or type barcode (optional)" />
          </Field>

          {/* Category */}
          <Field label="Category">
            <select {...register('category_id')} className={inputClass()}>
              <option value="">-- No Category --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buying Price (KES) *" error={errors.buying_price?.message}>
              <input {...register('buying_price')} type="number" step="0.01" min="0"
                className={inputClass(!!errors.buying_price)} placeholder="0.00" />
            </Field>
            <Field label="Selling Price (KES) *" error={errors.selling_price?.message}>
              <input {...register('selling_price')} type="number" step="0.01" min="0"
                className={inputClass(!!errors.selling_price)} placeholder="0.00" />
            </Field>
          </div>

          {/* Stock & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock Quantity *" error={errors.stock_quantity?.message}>
              <input {...register('stock_quantity')} type="number" min="0"
                className={inputClass(!!errors.stock_quantity)} placeholder="0" />
            </Field>
            <Field label="Unit *" error={errors.unit?.message}>
              <select {...register('unit')} className={inputClass(!!errors.unit)}>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          {/* Profit preview */}
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">Margin Preview</p>
            <p className="text-sm text-blue-800 mt-0.5">
              Set prices above to see profit margin
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
                rounded-xl hover:bg-gray-50 transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" disabled={isSaving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                rounded-xl transition-colors text-sm flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed">
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                product ? 'Update Product' : 'Add Product'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}