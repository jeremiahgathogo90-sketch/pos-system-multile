import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  Plus, Search, Edit2, Trash2, Phone,
  Mail, CreditCard, AlertCircle, X, Loader2,
  DollarSign, Users, TrendingDown, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Customer } from '../../types/database'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  credit_limit: z.coerce.number().min(0),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function CustomerModal({
  customer, onSave, onClose
}: {
  customer?: Customer | null
  onSave: (data: Partial<Customer>) => Promise<void>
  onClose: () => void
}) {
  const [isSaving, setIsSaving] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer?.name || '',
      phone: customer?.phone || '',
      email: customer?.email || '',
      credit_limit: customer?.credit_limit || 0,
      notes: customer?.notes || '',
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

  const inputClass = (err?: boolean) =>
    `w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
      err ? 'border-red-400 bg-red-50'
          : 'border-gray-200 bg-gray-50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white'
    }`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">{customer ? 'Edit Customer' : 'Add Customer'}</h3>
            <p className="text-xs text-gray-400">Fill in customer details</p>
          </div>
          <button onClick={onClose} title="Close" aria-label="Close modal">
            <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
            <input {...register('name')} className={inputClass(!!errors.name)} placeholder="John Doe" />
            {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
              <input {...register('phone')} className={inputClass()} placeholder="+254 7XX XXX XXX" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input {...register('email')} className={inputClass(!!errors.email)} placeholder="john@example.com" />
              {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Credit Limit (KES)</label>
            <input {...register('credit_limit')} type="number" min="0"
              className={inputClass()} placeholder="0" />
            <p className="text-xs text-gray-400 mt-0.5">Set to 0 to disable credit for this customer</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea {...register('notes')} rows={2}
              className={inputClass()} placeholder="Any additional notes..." />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
                rounded-xl hover:bg-gray-50 transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" disabled={isSaving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                rounded-xl transition-colors text-sm flex items-center justify-center gap-2
                disabled:opacity-60">
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : customer ? 'Update' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaymentModal({
  customer, onPay, onClose
}: {
  customer: Customer
  onPay: (amount: number, notes: string) => Promise<void>
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [isPaying, setIsPaying] = useState(false)

  const handlePay = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > customer.outstanding_balance) { toast.error('Amount exceeds balance'); return }
    setIsPaying(true)
    try {
      await onPay(amt, notes)
      onClose()
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Record Payment</h3>
          <button onClick={onClose} title="Close" aria-label="Close modal"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs text-orange-600 font-medium">Outstanding Balance</p>
            <p className="text-2xl font-black text-orange-700">
              KES {customer.outstanding_balance.toLocaleString()}
            </p>
            <p className="text-xs text-orange-500 mt-0.5">{customer.name}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Amount (KES) *</label>
            <input
              type="number" value={amount} onChange={e => setAmount(e.target.value)}
              max={customer.outstanding_balance} placeholder="Enter amount..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 bg-gray-50 font-bold text-gray-700" aria-label="Payment amount input"
            />
            <div className="flex gap-2 mt-2">
              {[customer.outstanding_balance, customer.outstanding_balance / 2].map(v => (
                <button key={v} onClick={() => setAmount(v.toFixed(0))}
                  className="flex-1 py-1.5 bg-gray-100 hover:bg-blue-100 text-gray-600 
                    hover:text-blue-700 rounded-lg text-xs font-semibold transition-colors">
                  KES {v.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 bg-gray-50"
              placeholder="e.g. Cash payment" />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
                rounded-xl hover:bg-gray-50 text-sm">
              Cancel
            </button>
            <button onClick={handlePay} disabled={isPaying}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold 
                rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2">
              {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const { profile } = useAuthStore()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null)
  const isOwner = profile?.role === 'owner'
  const canEdit = ['owner', 'admin', 'accountant'].includes(profile?.role || '')

  useEffect(() => { fetchCustomers() }, [profile])

  const fetchCustomers = async () => {
    setIsLoading(true)
    let q = supabase.from('customers').select('*').order('name')
    if (!isOwner) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setCustomers(data || [])
    setIsLoading(false)
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalBalance = customers.reduce((s, c) => s + c.outstanding_balance, 0)
  const withBalance = customers.filter(c => c.outstanding_balance > 0).length
  const withCredit = customers.filter(c => c.credit_limit > 0).length

  const saveCustomer = async (data: Partial<Customer>) => {
    if (editingCustomer) {
      const { error } = await supabase.from('customers').update(data).eq('id', editingCustomer.id)
      if (error) throw error
      toast.success('Customer updated')
    } else {
      const { error } = await supabase.from('customers').insert({
        ...data, location_id: profile?.location_id
      })
      if (error) throw error
      toast.success('Customer added')
    }
    await fetchCustomers()
  }

  const deleteCustomer = async (id: string) => {
    if (!window.confirm('Delete this customer?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Customer deleted')
    fetchCustomers()
  }

  const recordPayment = async (amount: number, notes: string) => {
    if (!payingCustomer) return
    const { error } = await supabase.from('customer_payments').insert({
      customer_id: payingCustomer.id,
      location_id: profile?.location_id,
      amount, notes,
    })
    if (error) throw error
    toast.success(`Payment of KES ${amount.toLocaleString()} recorded`)
    fetchCustomers()
  }

  return (
    <div className="space-y-5">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Customers', value: customers.length, icon: Users, color: 'bg-blue-600', sub: `${filtered.length} showing` },
          { label: 'Total Outstanding', value: `KES ${(totalBalance / 1000).toFixed(1)}k`, icon: TrendingDown, color: 'bg-red-500', sub: 'Credit owed to you' },
          { label: 'With Balance', value: withBalance, icon: AlertCircle, color: withBalance > 0 ? 'bg-orange-500' : 'bg-green-600', sub: 'Have unpaid balances' },
          { label: 'Credit Enabled', value: withCredit, icon: CreditCard, color: 'bg-purple-600', sub: 'Have credit limits set' },
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
          <input
            type="text" placeholder="Search by name, phone or email..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl 
              text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={fetchCustomers} title="Refresh" aria-label="Refresh customers"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 
              text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {canEdit && (
            <button onClick={() => { setEditingCustomer(null); setShowModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                text-white text-sm font-semibold rounded-xl transition-colors">
              <Plus className="w-4 h-4" />
              Add Customer
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading customers...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Users className="w-14 h-14 mb-3" />
            <p className="text-base font-medium text-gray-400">No customers found</p>
            <p className="text-sm text-gray-300 mt-1">
              {search ? 'Try a different search' : 'Add your first customer'}
            </p>
            {canEdit && !search && (
              <button onClick={() => { setEditingCustomer(null); setShowModal(true) }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold 
                  rounded-xl hover:bg-blue-700 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Customer
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Customer', 'Contact', 'Credit Limit', 'Balance', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold 
                      text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(customer => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center 
                          justify-center text-blue-600 font-bold text-sm shrink-0">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{customer.name}</p>
                          {customer.notes && (
                            <p className="text-xs text-gray-400 truncate max-w-32">{customer.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {customer.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {customer.phone}
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Mail className="w-3 h-3" />
                            {customer.email}
                          </div>
                        )}
                        {!customer.phone && !customer.email && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {customer.credit_limit > 0 ? (
                        <span className="text-sm font-semibold text-gray-700">
                          KES {customer.credit_limit.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">No credit</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {customer.outstanding_balance > 0 ? (
                        <span className="text-sm font-bold text-red-600">
                          KES {customer.outstanding_balance.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-sm text-green-600 font-semibold">Cleared</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {customer.outstanding_balance > customer.credit_limit && customer.credit_limit > 0 ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-semibold rounded-full">
                          Over Limit
                        </span>
                      ) : customer.outstanding_balance > 0 ? (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full">
                          Has Balance
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                          Good Standing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {customer.outstanding_balance > 0 && canEdit && (
                          <button onClick={() => setPayingCustomer(customer)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 
                              hover:bg-green-100 text-green-600 rounded-lg text-xs font-semibold transition-colors">
                            <DollarSign className="w-3 h-3" />
                            Pay
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button onClick={() => { setEditingCustomer(customer); setShowModal(true) }} title="Edit" aria-label="Edit customer"
                              className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 
                                rounded-lg flex items-center justify-center">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteCustomer(customer.id)} title="Delete" aria-label="Delete customer"
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
              <span>{filtered.length} customers</span>
              <span>Total outstanding: <strong className="text-red-600">
                KES {filtered.reduce((s, c) => s + c.outstanding_balance, 0).toLocaleString()}
              </strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onSave={saveCustomer}
          onClose={() => { setShowModal(false); setEditingCustomer(null) }}
        />
      )}

      {payingCustomer && (
        <PaymentModal
          customer={payingCustomer}
          onPay={recordPayment}
          onClose={() => setPayingCustomer(null)}
        />
      )}
    </div>
  )
}