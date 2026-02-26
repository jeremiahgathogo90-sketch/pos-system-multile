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

/**
 * useRealtime
 * Watches one or more tables for INSERT/UPDATE/DELETE and fires callback.
 *
 * Failure strategy:
 *  - WebSocket connects → real-time updates, no polling
 *  - WebSocket fails/times out → silent fallback poll every 30s
 *  - Retries realtime with exponential backoff (5s → 10s → … max 5 min)
 *  - Never throws noisy errors to console
 */
export function useRealtime(
  tables: WatchTable[],
  callback: () => void,
  deps: any[] = []
): void {
  const cbRef      = useRef(callback)
  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer  = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted    = useRef(true)

  cbRef.current = callback

  useEffect(() => {
    mounted.current    = true
    retryCount.current = 0

    const clearTimers = () => {
      if (retryTimer.current) { clearTimeout(retryTimer.current);  retryTimer.current = null }
      if (pollTimer.current)  { clearInterval(pollTimer.current);  pollTimer.current  = null }
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

    // Exponential backoff capped at 5 minutes
    const backoffMs = () => Math.min(5_000 * Math.pow(2, retryCount.current), 300_000)

    const connect = () => {
      if (!mounted.current) return
      removeChannel()

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

        ch.subscribe((status) => {
          if (!mounted.current) return

          if (status === 'SUBSCRIBED') {
            // Connected — stop polling fallback, reset retry counter
            retryCount.current = 0
            stopPolling()
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Failed — fall back to polling and schedule reconnect
            startPolling()
            retryCount.current += 1
            retryTimer.current = setTimeout(connect, backoffMs())
          }
        })

        channelRef.current = ch
      } catch {
        // Realtime API completely unavailable (network down, firewall, etc.)
        startPolling()
        retryCount.current += 1
        retryTimer.current = setTimeout(connect, backoffMs())
      }
    }

    connect()

    return () => {
      mounted.current = false
      clearTimers()
      removeChannel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}