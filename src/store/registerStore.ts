import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RegisterState {
  registerId: string | null
  openingAmount: number
  openedAt: string | null
  isOpen: boolean
  setRegister: (id: string, amount: number, openedAt: string) => void
  closeRegister: () => void
}

export const useRegisterStore = create<RegisterState>()(
  persist(
    (set) => ({
      registerId: null,
      openingAmount: 0,
      openedAt: null,
      isOpen: false,
      setRegister: (id, amount, openedAt) =>
        set({ registerId: id, openingAmount: amount, openedAt, isOpen: true }),
      closeRegister: () =>
        set({ registerId: null, openingAmount: 0, openedAt: null, isOpen: false }),
    }),
    { name: 'pos-register' }
  )
)