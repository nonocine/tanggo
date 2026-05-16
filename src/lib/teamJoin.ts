import { supabase } from './supabase'

export function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, '')
}

export interface MemberMatch {
  id: string
  name: string
}

export async function checkMemberName(
  teamId: string,
  inputName: string,
): Promise<MemberMatch | null> {
  const normalized = normalizeForCompare(inputName)
  if (normalized.length === 0) return null

  const { data, error } = await supabase
    .from('tanggo_team_members')
    .select('id, name')
    .eq('team_id', teamId)

  if (error || !data) return null

  const match = data.find(
    (m) => normalizeForCompare(m.name) === normalized,
  )
  return match ? { id: match.id, name: match.name } : null
}
