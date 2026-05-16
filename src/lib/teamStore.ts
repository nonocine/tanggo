import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TeamStore {
  teamId: string | null
  teamName: string | null
  setTeam: (id: string, name: string) => void
  clearTeam: () => void
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      teamId: null,
      teamName: null,
      setTeam: (id, name) => set({ teamId: id, teamName: name }),
      clearTeam: () => set({ teamId: null, teamName: null }),
    }),
    { name: 'tanggo_team' },
  ),
)
