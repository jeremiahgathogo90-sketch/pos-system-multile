import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}

const colorMap = {
  blue:   { icon: 'bg-blue-600' },
  green:  { icon: 'bg-green-600' },
  yellow: { icon: 'bg-yellow-500' },
  red:    { icon: 'bg-red-500' },
  purple: { icon: 'bg-purple-600' },
}

function StatCard({ title, value, subtitle, icon: Icon, color }: Props) {
  const c = colorMap[color]
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1 truncate">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ml-3', c.icon)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  )
}

export default StatCard