import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BranchState {
  selectedBranchId: string | null   // null = ALL branches
  selectedBranchName: string        // for display
  setBranch: (id: string | null, name: string) => void
  clearBranch: () => void
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId:   null,
      selectedBranchName: 'All Branches',

      setBranch: (id, name) => set({ selectedBranchId: id, selectedBranchName: name }),
      clearBranch: () => set({ selectedBranchId: null, selectedBranchName: 'All Branches' }),
    }),
    {
      name: 'pos-branch',
    }
  )
)

/**
 * Returns the effective location_id to use for DB queries.
 * - owner/accountant with a branch selected → that branch id
 * - owner/accountant with "All" selected    → null (no filter)
 * - cashier/admin                           → their own location_id from profile
 */
export function getEffectiveLocationId(
  role: string | undefined,
  profileLocationId: string | null | undefined,
  selectedBranchId: string | null
): string | null {
  if (role === 'owner' || role === 'accountant') {
    return selectedBranchId   // null = all branches
  }
  return profileLocationId ?? null
}