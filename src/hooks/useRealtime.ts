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
  | 'store_stock'
  | 'stock_transfers'
  | 'stock_transfer_items'
  | 'audit_log'

/**
 * useRealtime
 * Watches one or more tables for INSERT/UPDATE/DELETE and fires callback.
 *
 * Failure strategy:
 *  - Delays first connection by 2s to let auth/Supabase settle
 *  - WebSocket connects → real-time updates, no polling
 *  - If not SUBSCRIBED within 10s → fall back to polling every 30s
 *  - Retries realtime with exponential backoff (5s → 10s → max 5 min)
 *  - Never throws noisy errors to console
 */
export function useRealtime(
  tables: WatchTable[],
  callback: () => void,
  deps: any[] = []
): void {
  const cbRef          = useRef(callback)
  const retryCount     = useRef(0)
  const retryTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef     = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted        = useRef(true)
  const subscribed     = useRef(false)

  cbRef.current = callback

  useEffect(() => {
    mounted.current    = true
    retryCount.current = 0
    subscribed.current = false

    const clearTimers = () => {
      if (retryTimer.current)   { clearTimeout(retryTimer.current);   retryTimer.current   = null }
      if (pollTimer.current)    { clearInterval(pollTimer.current);   pollTimer.current    = null }
      if (connectTimer.current) { clearTimeout(connectTimer.current); connectTimer.current = null }
      if (startTimer.current)   { clearTimeout(startTimer.current);   startTimer.current   = null }
    }

    const startPolling = () => {
      if (pollTimer.current) return
      pollTimer.current = setInterval(() => {
        if (mounted.current) cbRef.current()
      }, 30_000)
    }

    const stopPolling = () => {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
    }

    const removeChannel = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
    }

    const backoffMs = () => Math.min(5_000 * Math.pow(2, retryCount.current), 300_000)

    const connect = () => {
      if (!mounted.current) return
      removeChannel()
      subscribed.current = false

      const name = `rt_${tables.join('_')}_${Math.random().toString(36).slice(2, 7)}`

      try {
        const ch = supabase.channel(name)

        tables.forEach(table => {
          ch.on(
            // @ts-ignore
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => { if (mounted.current) cbRef.current() }
          )
        })

        // If not SUBSCRIBED within 10s, fall back to polling
        connectTimer.current = setTimeout(() => {
          if (!subscribed.current && mounted.current) {
            startPolling()
            retryCount.current += 1
            retryTimer.current = setTimeout(connect, backoffMs())
          }
        }, 10_000)

        ch.subscribe((status) => {
          if (!mounted.current) return

          if (status === 'SUBSCRIBED') {
            subscribed.current = true
            if (connectTimer.current) { clearTimeout(connectTimer.current); connectTimer.current = null }
            retryCount.current = 0
            stopPolling()
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            subscribed.current = false
            if (connectTimer.current) { clearTimeout(connectTimer.current); connectTimer.current = null }
            startPolling()
            retryCount.current += 1
            retryTimer.current = setTimeout(connect, backoffMs())
          }
        })

        channelRef.current = ch
      } catch {
        startPolling()
        retryCount.current += 1
        retryTimer.current = setTimeout(connect, backoffMs())
      }
    }

    // Delay first connection by 2s to let auth + Supabase client settle
    startTimer.current = setTimeout(connect, 2_000)

    return () => {
      mounted.current = false
      clearTimers()
      removeChannel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}