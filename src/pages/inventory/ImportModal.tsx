import { useState, useRef } from 'react'
import { X, Upload, Download, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import Papa from 'papaparse'
import type { Product } from '../../types/database'
import type { Category } from '../../types/database'

interface Props {
  categories: Category[]
  onImport: (rows: Partial<Product>[]) => Promise<void>
  onClose: () => void
}

export default function ImportModal({ categories, onImport, onClose }: Props) {
  const [parsed, setParsed] = useState<Partial<Product>[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const csv = Papa.unparse([
      {
        name: 'Coca Cola 500ml',
        barcode: '123456789',
        category: 'Beverages',
        buying_price: 55,
        selling_price: 80,
        stock_quantity: 100,
        unit: 'pcs',
      },
      {
        name: 'Sample Product 2',
        barcode: '',
        category: '',
        buying_price: 100,
        selling_price: 150,
        stock_quantity: 50,
        unit: 'kg',
      }
    ])
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'products_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = (file: File) => {
    setFileName(file.name)
    setErrors([])
    setParsed([])

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errs: string[] = []
        const rows: Partial<Product>[] = []

        results.data.forEach((row: any, i: number) => {
          const lineNum = i + 2
          if (!row.name) { errs.push(`Row ${lineNum}: Missing product name`); return }
          if (!row.selling_price) { errs.push(`Row ${lineNum}: Missing selling price`); return }

          // Match category by name
          const cat = categories.find(c =>
            c.name.toLowerCase() === (row.category || '').toLowerCase()
          )

          rows.push({
            name: row.name,
            barcode: row.barcode || null,
            category_id: cat?.id || null,
            buying_price: parseFloat(row.buying_price) || 0,
            selling_price: parseFloat(row.selling_price),
            stock_quantity: parseInt(row.stock_quantity) || 0,
            unit: row.unit || 'pcs',
            is_active: true,
          })
        })

        setErrors(errs)
        setParsed(rows)
      }
    })
  }

  const handleImport = async () => {
    if (parsed.length === 0) return
    setIsImporting(true)
    try {
      await onImport(parsed)
      onClose()
    } catch (err: any) {
      setErrors([err.message])
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">Import Products (CSV)</h3>
            <p className="text-xs text-gray-400">Bulk upload products from a spreadsheet</p>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Download template */}
          <button onClick={downloadTemplate}
            className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed 
              border-blue-300 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors">
            <Download className="w-5 h-5 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-semibold">Download CSV Template</p>
              <p className="text-xs text-blue-400">Get the correct format before importing</p>
            </div>
          </button>

          {/* File upload */}
          <div
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-2 px-4 py-6 border-2 border-dashed 
              border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-gray-50 
              transition-all">
            <Upload className="w-8 h-8 text-gray-400" />
            {fileName ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">{fileName}</p>
                <p className="text-xs text-gray-400">Click to change file</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Click to upload CSV</p>
                <p className="text-xs text-gray-400">or drag and drop</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-700">
                  {parsed.length} products ready to import
                </p>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {parsed.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-green-700">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      <span className="font-medium truncate max-w-48">{p.name}</span>
                    </div>
                    <span>KES {p.selling_price} · Qty {p.stock_quantity}</span>
                  </div>
                ))}
                {parsed.length > 5 && (
                  <p className="text-xs text-green-600 font-medium">
                    + {parsed.length - 5} more products...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <p className="text-sm font-semibold text-red-600">
                  {errors.length} error{errors.length > 1 ? 's' : ''} found
                </p>
              </div>
              {errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-500 pl-6">{e}</p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold 
                rounded-xl hover:bg-gray-50 transition-colors text-sm">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={parsed.length === 0 || isImporting}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
              {isImporting ? 'Importing...' : `Import ${parsed.length} Products`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}