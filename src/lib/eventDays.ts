/** tanggo_event_config.days (jsonb) 한 항목 */
export interface DayDef {
  day: number
  label: string
  desc: string
  /** true = 배정된 장소만 입장 가능 / false = 장소 구분 없이 전체 미션 진행 */
  use_location_assign: boolean
}

export const MAX_EVENT_DAYS = 7

export const DEFAULT_DAYS: DayDef[] = [
  { day: 1, label: '1일차', desc: '기관 라운딩 미션', use_location_assign: false },
  { day: 2, label: '2일차', desc: '장소별 미션 수행', use_location_assign: true },
]

export function makeDay(day: number): DayDef {
  return { day, label: `${day}일차`, desc: '', use_location_assign: false }
}

export function parseDays(raw: unknown): DayDef[] {
  if (!Array.isArray(raw)) return DEFAULT_DAYS
  const parsed: DayDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const day = Number(rec.day)
    if (!Number.isFinite(day)) continue
    parsed.push({
      day,
      label: typeof rec.label === 'string' ? rec.label : `${day}일차`,
      desc: typeof rec.desc === 'string' ? rec.desc : '',
      use_location_assign: rec.use_location_assign === true,
    })
  }
  if (parsed.length === 0) return DEFAULT_DAYS
  return parsed.sort((a, b) => a.day - b.day)
}

/** 일수를 count 에 맞춘다 — 늘어나면 뒤에 추가, 줄어들면 뒤에서부터 제거 */
export function resizeDays(days: DayDef[], count: number): DayDef[] {
  if (count <= days.length) return days.slice(0, count)
  const next = [...days]
  for (let d = days.length + 1; d <= count; d += 1) next.push(makeDay(d))
  return next
}

/**
 * 미션의 day_number 를 일차 번호로 정규화한다.
 * Phase 2 이전 문항은 day_number 가 null 이고 이들이 1일차다.
 */
export function normalizeDayNumber(raw: number | null | undefined): number {
  return raw == null ? 1 : raw
}

const DAY_EMOJIS = ['📅', '🗺️', '🧭', '🎒', '🚩', '🌟', '🏁']

export function dayEmoji(day: number): string {
  if (!Number.isFinite(day) || day < 1) return '📌'
  return DAY_EMOJIS[(Math.floor(day) - 1) % DAY_EMOJIS.length]
}
