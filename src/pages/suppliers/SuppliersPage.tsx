import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  Plus, Search, Edit2, Trash2, Phone, Mail,
  X, Loader2, Truck, DollarSign, AlertCircle,
  TrendingUp, RefreshCw
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Supplier } from '../../types/database'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function SupplierModal({
  supplier, onSave, onClose
}: {
  supplier?: Supplier | null
  onSave: (data: Partial<Supplier>) => Promise<void>
  onClose: () => void
}) {
  const [isSaving, setIsSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supplier?.name || '',
      phone: supplier?.phone || '',
      email: supplier?.email || '',
      notes: supplier?.notes || '',
    }
  })

  const onSubmit = async (data: FormData) => {
    setIsSaving(true)
    try {
      await onSave({ ...data, email: data.email || null, phone: data.phone || null })
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const inputClass = () =>
    'w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">{supplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <p className="text-xs text-gray-400">Fill in supplier details</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier Name *</label>
            <input {...register('name')} className={inputClass()} placeholder="e.g. ABC Distributors" />
            {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
              <input {...register('phone')} className={inputClass()} placeholder="+254 7XX XXX XXX" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input {...register('email')} className={inputClass()} placeholder="supplier@email.com" />
              {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea {...register('notes')} rows={2} className={inputClass()}
              placeholder="Payment terms, delivery days, etc." />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
                rounded-xl hover:bg-gray-50 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={isSaving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : supplier ? 'Update' : 'Add Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaymentModal({
  supplier, onPay, onClose
}: {
  supplier: Supplier
  onPay: (amount: number, notes: string) => Promise<void>
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [isPaying, setIsPaying] = useState(false)

  const handlePay = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > supplier.outstanding_debt) { toast.error('Amount exceeds debt'); return }
    setIsPaying(true)
    try { await onPay(amt, notes); onClose() }
    finally { setIsPaying(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Pay Supplier</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs text-red-600 font-medium">You Owe</p>
            <p className="text-2xl font-black text-red-700">
              KES {supplier.outstanding_debt.toLocaleString()}
            </p>
            <p className="text-xs text-red-400 mt-0.5">{supplier.name}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Amount *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 bg-gray-50 text-lg font-bold"
              placeholder="Enter amount..." />
            <div className="flex gap-2 mt-2">
              {[supplier.outstanding_debt, supplier.outstanding_debt / 2].map(v => (
                <button key={v} onClick={() => setAmount(v.toFixed(0))}
                  className="flex-1 py-1.5 bg-gray-100 hover:bg-red-100 text-gray-600 
                    hover:text-red-700 rounded-lg text-xs font-semibold transition-colors">
                  KES {v.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 bg-gray-50"
              placeholder="e.g. Bank transfer ref #12345" />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
                rounded-xl hover:bg-gray-50 text-sm">Cancel</button>
            <button onClick={handlePay} disabled={isPaying}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold 
                rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2">
              {isPaying && <Loader2 className="w-4 h-4 animate-spin" />}
              Pay Supplier
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SuppliersPage() {
  const { profile } = useAuthStore()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null)
  const isOwner = profile?.role === 'owner'
  const canEdit = ['owner', 'admin', 'accountant'].includes(profile?.role || '')

  useEffect(() => { fetchSuppliers() }, [profile])

  const fetchSuppliers = async () => {
    setIsLoading(true)
    let q = supabase.from('suppliers').select('*').order('name')
    if (!isOwner) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setSuppliers(data || [])
    setIsLoading(false)
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || '').includes(search)
  )

  const totalDebt = suppliers.reduce((s, sup) => s + sup.outstanding_debt, 0)
  const withDebt = suppliers.filter(s => s.outstanding_debt > 0).length

  const saveSupplier = async (data: Partial<Supplier>) => {
    if (editingSupplier) {
      const { error } = await supabase.from('suppliers').update(data).eq('id', editingSupplier.id)
      if (error) throw error
      toast.success('Supplier updated')
    } else {
      const { error } = await supabase.from('suppliers').insert({
        ...data, location_id: profile?.location_id
      })
      if (error) throw error
      toast.success('Supplier added')
    }
    fetchSuppliers()
  }

  const deleteSupplier = async (id: string) => {
    if (!window.confirm('Delete this supplier?')) return
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Supplier deleted')
    fetchSuppliers()
  }

  const recordPayment = async (amount: number, notes: string) => {
    if (!payingSupplier) return
    const { error } = await supabase.from('supplier_payments').insert({
      supplier_id: payingSupplier.id,
      location_id: profile?.location_id,
      amount, notes,
    })
    if (error) throw error
    toast.success(`Payment of KES ${amount.toLocaleString()} recorded`)
    fetchSuppliers()
  }

  return (
    <div className="space-y-5">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Suppliers', value: suppliers.length, icon: Truck, color: 'bg-blue-600', sub: `${filtered.length} showing` },
          { label: 'Total Debt', value: `KES ${(totalDebt / 1000).toFixed(1)}k`, icon: TrendingUp, color: 'bg-red-500', sub: 'You owe suppliers' },
          { label: 'With Debt', value: withDebt, icon: AlertCircle, color: withDebt > 0 ? 'bg-orange-500' : 'bg-green-600', sub: 'Unpaid suppliers' },
          { label: 'Fully Paid', value: suppliers.length - withDebt, icon: DollarSign, color: 'bg-green-600', sub: 'No outstanding debt' },
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 
        flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search suppliers..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl 
              text-sm outline-none focus:border-blue-400" />
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSuppliers}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 
              text-gray-500 rounded-xl hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {canEdit && (
            <button onClick={() => { setEditingSupplier(null); setShowModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                text-white text-sm font-semibold rounded-xl transition-colors">
              <Plus className="w-4 h-4" />
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-400">Loading suppliers...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Truck className="w-14 h-14 mb-3" />
            <p className="text-base font-medium text-gray-400">No suppliers found</p>
            {canEdit && !search && (
              <button onClick={() => { setEditingSupplier(null); setShowModal(true) }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold 
                  rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Supplier
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Supplier', 'Contact', 'Outstanding Debt', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold 
                      text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(supplier => (
                  <tr key={supplier.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center 
                          justify-center text-orange-600 font-bold text-sm shrink-0">
                          {supplier.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{supplier.name}</p>
                          {supplier.notes && (
                            <p className="text-xs text-gray-400 truncate max-w-40">{supplier.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {supplier.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Phone className="w-3 h-3 text-gray-400" />{supplier.phone}
                          </div>
                        )}
                        {supplier.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Mail className="w-3 h-3" />{supplier.email}
                          </div>
                        )}
                        {!supplier.phone && !supplier.email && <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {supplier.outstanding_debt > 0 ? (
                        <span className="text-sm font-bold text-red-600">
                          KES {supplier.outstanding_debt.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-sm text-green-600 font-semibold">No Debt</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {supplier.outstanding_debt > 0 ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-semibold rounded-full">
                          Has Debt
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                          Cleared
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {supplier.outstanding_debt > 0 && canEdit && (
                          <button onClick={() => setPayingSupplier(supplier)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 
                              hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold">
                            <DollarSign className="w-3 h-3" />
                            Pay
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button onClick={() => { setEditingSupplier(supplier); setShowModal(true) }}
                              className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 
                                rounded-lg flex items-center justify-center">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteSupplier(supplier.id)}
                              className="w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 
                                rounded-lg flex items-center justify-center">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-between 
              text-xs text-gray-500">
              <span>{filtered.length} suppliers</span>
              <span>Total debt: <strong className="text-red-600">
                KES {filtered.reduce((s, sup) => s + sup.outstanding_debt, 0).toLocaleString()}
              </strong></span>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <SupplierModal
          supplier={editingSupplier}
          onSave={saveSupplier}
          onClose={() => { setShowModal(false); setEditingSupplier(null) }}
        />
      )}

      {payingSupplier && (
        <PaymentModal
          supplier={payingSupplier}
          onPay={recordPayment}
          onClose={() => setPayingSupplier(null)}
        />
      )}
    </div>
  )
}