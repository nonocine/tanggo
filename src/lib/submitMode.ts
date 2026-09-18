import { supabase } from './supabase'

/** tanggo_event_config.submit_mode — 팀이 답을 제출하는 방식 */
export type SubmitMode = 'consensus' | 'leader_only' | 'free'

export const SUBMIT_MODES: SubmitMode[] = ['consensus', 'leader_only', 'free']

export const SUBMIT_MODE_LABELS: Record<
  SubmitMode,
  { label: string; desc: string; emoji: string }
> = {
  consensus: {
    label: '전원 동의 후 방장 제출',
    desc: '팀원 모두가 같은 답을 선택해야 방장이 제출할 수 있어요. 각자 핸드폰이 있을 때 참여를 유도합니다.',
    emoji: '🤝',
  },
  leader_only: {
    label: '방장만 제출',
    desc: '투표 없이 방장만 답을 제출합니다. 어린 참가자처럼 팀장만 핸드폰이 있을 때 사용해요.',
    emoji: '👑',
  },
  free: {
    label: '각자 자유 제출',
    desc: '팀원 누구나 자유롭게 제출할 수 있어요.',
    emoji: '✋',
  },
}

/** 비방장 화면에 공통으로 띄우는 안내 문구 */
export const LEADER_ONLY_NOTICE = '👑 방장이 대표로 제출해요'

function isSubmitMode(v: unknown): v is SubmitMode {
  return typeof v === 'string' && (SUBMIT_MODES as string[]).includes(v)
}

/**
 * event_config 행에서 제출 방식을 읽는다.
 * submit_mode 컬럼이 아직 없는 DB 에서는 기존 require_consensus 로 판정한다.
 */
export function parseSubmitMode(row: {
  submit_mode?: string | null
  require_consensus?: boolean | null
}): SubmitMode {
  if (isSubmitMode(row.submit_mode)) return row.submit_mode
  if (typeof row.require_consensus === 'boolean') {
    return row.require_consensus ? 'consensus' : 'free'
  }
  return 'consensus'
}

export interface SubmitModeConfigRow {
  submit_mode?: string | null
  require_consensus?: boolean | null
}

/**
 * submit_mode 를 포함해 event_config 를 읽는다.
 * 컬럼이 없는 상태로 코드가 먼저 배포되면 SELECT 가 통째로 실패해 화면이 죽으므로,
 * 실패하면 기존 컬럼만으로 한 번 더 조회한다. (Lobby 의 show_episode 와 동일한 패턴)
 */
export async function fetchEventConfigWithSubmitMode<T>(
  baseColumns: string,
): Promise<{
  data: (T & SubmitModeConfigRow) | null
  error: { message: string } | null
}> {
  const withMode = await supabase
    .from('tanggo_event_config')
    .select(`${baseColumns}, submit_mode`)
    .eq('id', 1)
    .maybeSingle()
  if (!withMode.error) {
    return { data: (withMode.data ?? null) as (T & SubmitModeConfigRow) | null, error: null }
  }
  const legacy = await supabase
    .from('tanggo_event_config')
    .select(baseColumns)
    .eq('id', 1)
    .maybeSingle()
  return {
    data: (legacy.data ?? null) as (T & SubmitModeConfigRow) | null,
    error: legacy.error,
  }
}

/**
 * leader_only 모드에서 이 사람이 제출할 수 있는지.
 * leader_name 이 없는 예전 팀이나 내 이름을 모르는 경우엔 잠그지 않는다 (잠김 방지).
 */
export function canSubmitInLeaderOnly(
  leaderName: string | null | undefined,
  memberName: string | null | undefined,
): boolean {
  if (!leaderName || !memberName) return true
  return leaderName === memberName
}
