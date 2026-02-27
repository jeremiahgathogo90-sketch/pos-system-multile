import { useState } from 'react'
import { X, Plus, Tag } from 'lucide-react'
import type { Category } from '../../types/database'

interface Props {
  categories: Category[]
  onAdd: (name: string) => Promise<void>
  onClose: () => void
}

export default function CategoryModal({ categories, onAdd, onClose }: Props) {
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) return
    setIsSaving(true)
    try {
      await onAdd(name.trim())
      setName('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Manage Categories</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center" aria-label="Close category modal">
            <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="New category name..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm 
                outline-none focus:border-blue-400 bg-gray-50"
            />
            <button onClick={handleAdd} disabled={isSaving || !name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold 
                rounded-xl disabled:opacity-50 flex items-center gap-1.5 transition-colors">
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {/* Existing categories */}
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">No categories yet</p>
            ) : (
              categories.map(cat => (
                <div key={cat.id}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <Tag className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-sm text-gray-700">{cat.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}