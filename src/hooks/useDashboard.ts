import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export interface DashboardMetrics {
  todaySales: number
  todayTransactions: number
  todayProfit: number
  lowStockCount: number
  totalProducts: number
  totalCustomers: number
  weekSales: { date: string; total: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
  recentSales: any[]
  paymentBreakdown: { method: string; total: number; count: number }[]
  branchSales: { name: string; total: number; transactions: number }[]
}

export function useDashboard() {
  const { profile } = useAuthStore()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isOwner = profile?.role === 'owner'
  const locationId = profile?.location_id

  useEffect(() => {
    if (profile) fetchMetrics()
  }, [profile])

  const fetchMetrics = async () => {
    setIsLoading(true)
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()

      // Base query filter
      const locationFilter = isOwner ? {} : { location_id: locationId }

      // 1. Today's sales
      let todaySalesQuery = supabase
        .from('sales')
        .select('total_amount, subtotal, created_at, payment_method, cashier_id, location_id')
        .gte('created_at', todayISO)

      if (!isOwner) todaySalesQuery = todaySalesQuery.eq('location_id', locationId)

      const { data: todaySalesData } = await todaySalesQuery

      const todaySales = todaySalesData?.reduce((sum, s) => sum + s.total_amount, 0) || 0
      const todayTransactions = todaySalesData?.length || 0

      // 2. Payment breakdown (today)
      const paymentMap: Record<string, { total: number; count: number }> = {}
      todaySalesData?.forEach(s => {
        if (!paymentMap[s.payment_method]) {
          paymentMap[s.payment_method] = { total: 0, count: 0 }
        }
        paymentMap[s.payment_method].total += s.total_amount
        paymentMap[s.payment_method].count += 1
      })
      const paymentBreakdown = Object.entries(paymentMap).map(([method, data]) => ({
        method, ...data
      }))

      // 3. Week sales (last 7 days)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 6)
      weekAgo.setHours(0, 0, 0, 0)

      let weekQuery = supabase
        .from('sales')
        .select('total_amount, created_at')
        .gte('created_at', weekAgo.toISOString())

      if (!isOwner) weekQuery = weekQuery.eq('location_id', locationId)

      const { data: weekData } = await weekQuery

      // Group by date
      const weekMap: Record<string, number> = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric' })
        weekMap[key] = 0
      }
      weekData?.forEach(s => {
        const key = new Date(s.created_at).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric' })
        if (weekMap[key] !== undefined) weekMap[key] += s.total_amount
      })
      const weekSales = Object.entries(weekMap).map(([date, total]) => ({ date, total }))

      // 4. Low stock count
      let stockQuery = supabase
        .from('products')
        .select('id', { count: 'exact' })
        .lt('stock_quantity', 10)
        .eq('is_active', true)

      if (!isOwner) stockQuery = stockQuery.eq('location_id', locationId)
      const { count: lowStockCount } = await stockQuery

      // 5. Total products
      let productsQuery = supabase
        .from('products')
        .select('id', { count: 'exact' })
        .eq('is_active', true)

      if (!isOwner) productsQuery = productsQuery.eq('location_id', locationId)
      const { count: totalProducts } = await productsQuery

      // 6. Total customers
      let customersQuery = supabase
        .from('customers')
        .select('id', { count: 'exact' })

      if (!isOwner) customersQuery = customersQuery.eq('location_id', locationId)
      const { count: totalCustomers } = await customersQuery

      // 7. Top products this week
      let topProductsQuery = supabase
        .from('sale_items')
        .select('product_name, quantity, total_price, sale:sales!inner(created_at, location_id)')
        .gte('sale.created_at', weekAgo.toISOString())

      if (!isOwner) topProductsQuery = topProductsQuery.eq('sale.location_id', locationId)

      const { data: saleItemsData } = await topProductsQuery

      const productMap: Record<string, { quantity: number; revenue: number }> = {}
      saleItemsData?.forEach((item: any) => {
        if (!productMap[item.product_name]) {
          productMap[item.product_name] = { quantity: 0, revenue: 0 }
        }
        productMap[item.product_name].quantity += item.quantity
        productMap[item.product_name].revenue += item.total_price
      })
      const topProducts = Object.entries(productMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

      // 8. Recent sales
      let recentQuery = supabase
        .from('sales')
        .select('*, cashier:profiles(full_name), customer:customers(name)')
        .order('created_at', { ascending: false })
        .limit(8)

      if (!isOwner) recentQuery = recentQuery.eq('location_id', locationId)
      const { data: recentSales } = await recentQuery

      // 9. Branch comparison (owner only)
      let branchSales: { name: string; total: number; transactions: number }[] = []
      if (isOwner) {
        const { data: locations } = await supabase
          .from('locations')
          .select('id, name')
          .eq('is_active', true)

        if (locations) {
          const branchData = await Promise.all(
            locations.map(async (loc) => {
              const { data } = await supabase
                .from('sales')
                .select('total_amount')
                .eq('location_id', loc.id)
                .gte('created_at', todayISO)

              return {
                name: loc.name,
                total: data?.reduce((sum, s) => sum + s.total_amount, 0) || 0,
                transactions: data?.length || 0
              }
            })
          )
          branchSales = branchData
        }
      }

      setMetrics({
        todaySales,
        todayTransactions,
        todayProfit: todaySales * 0.3, // estimate — will improve with buying price later
        lowStockCount: lowStockCount || 0,
        totalProducts: totalProducts || 0,
        totalCustomers: totalCustomers || 0,
        weekSales,
        topProducts,
        recentSales: recentSales || [],
        paymentBreakdown,
        branchSales,
      })
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return { metrics, isLoading, refetch: fetchMetrics }
}