import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export type WatchTable =
  | 'sales'
  | 'sale_items'
  | 'sale_payments'
  | 'products'
  | 'customers'
  | 'purchase_orders'
  | 'purchase_order_items'
  | 'cash_registers'
  | 'profiles'
  | 'categories'
  | 'suppliers'

/**
 * useRealtime
 * Watches one or more tables for any INSERT/UPDATE/DELETE and fires callback.
 * Gracefully handles WebSocket failures — falls back to polling every 30s.
 *
 * @param tables   Tables to watch
 * @param callback Fired on any change
 * @param deps     Re-subscribe when these change (e.g. locationId)
 */
export function useRealtime(
  tables: WatchTable[],
  callback: () => void,
  deps: any[] = []
): void {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let realtimeWorking = false

    const channelName = `rt_${tables.join('_')}_${Math.random().toString(36).slice(2, 7)}`

    try {
      channel = supabase.channel(channelName)

      tables.forEach(table => {
        channel!.on(
          // @ts-ignore — postgres_changes typing varies by supabase-js version
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => { realtimeWorking = true; cbRef.current() }
        )
      })

      channel
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            realtimeWorking = true
            // Clear fallback poll if realtime connected
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            realtimeWorking = false
            // Fallback: poll every 30 seconds
            if (!pollTimer) {
              pollTimer = setInterval(() => cbRef.current(), 30_000)
            }
          }
        })
    } catch {
      // Realtime completely unavailable — fall back to polling
      pollTimer = setInterval(() => cbRef.current(), 30_000)
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (pollTimer) clearInterval(pollTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}