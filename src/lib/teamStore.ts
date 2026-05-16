import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from './supabase'

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

export interface TeamLookup {
  id: string
  team_name: string
  started_at: string | null
  finished_at: string | null
}

export async function getTeamFromName(name: string): Promise<TeamLookup | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const { data, error } = await supabase
    .from('tanggo_teams')
    .select('id, team_name, started_at, finished_at')
    .eq('team_name', trimmed)
    .maybeSingle()
  if (error || !data) return null
  return data as TeamLookup
}
