import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

interface TeamRow {
  id: string
  team_name: string
  start_order: number | null
  assigned_locations: unknown
}

interface LocationOption {
  group: string
  order: number
  slotCount: number
}

function toStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((v): v is string => typeof v === 'string')
}

export default function LocationAssign() {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [teamsRes, quizzesRes] = await Promise.all([
      supabase
        .from('tanggo_teams')
        .select('id, team_name, start_order, assigned_locations')
        .order('start_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('tanggo_quizzes')
        .select('location_group, location_group_order')
        .eq('day_number', 2)
        .not('location_group', 'is', null),
    ])

    if (teamsRes.error || quizzesRes.error) {
      setError(teamsRes.error?.message ?? quizzesRes.error?.message ?? '로딩 실패')
      setLoading(false)
      return
    }
    setError(null)
    setTeams((teamsRes.data ?? []) as TeamRow[])

    // DISTINCT location_group (+ 슬롯 수 집계)
    const map = new Map<string, LocationOption>()
    for (const row of (quizzesRes.data ?? []) as {
      location_group: string | null
      location_group_order: number | null
    }[]) {
      if (!row.location_group) continue
      const prev = map.get(row.location_group)
      if (prev) {
        prev.slotCount += 1
        if (row.location_group_order != null && prev.order === 9999) {
          prev.order = row.location_group_order
        }
      } else {
        map.set(row.location_group, {
          group: row.location_group,
          order: row.location_group_order ?? 9999,
          slotCount: 1,
        })
      }
    }
    setLocations(
      [...map.values()].sort(
        (a, b) => a.order - b.order || a.group.localeCompare(b.group),
      ),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  )

  const selectedAssigned = useMemo(
    () => toStringArray(selectedTeam?.assigned_locations),
    [selectedTeam],
  )

  async function save(teamId: string, next: string[]) {
    setBusy(true)
    const { error: updateErr } = await supabase
      .from('tanggo_teams')
      .update({ assigned_locations: next })
      .eq('id', teamId)
    setBusy(false)
    if (updateErr) {
      setToast(`저장 실패: ${updateErr.message}`)
      return
    }
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, assigned_locations: next } : t)),
    )
    setToast('저장되었습니다 ✅')
  }

  function toggle(group: string) {
    if (!selectedTeam) return
    const current = selectedAssigned ?? []
    const next = current.includes(group)
      ? current.filter((g) => g !== group)
      : [...current, group]
    // 장소 순서대로 정렬해 저장
    const ordered = locations.map((l) => l.group).filter((g) => next.includes(g))
    save(selectedTeam.id, ordered)
  }

  function assignAll() {
    if (!selectedTeam) return
    save(
      selectedTeam.id,
      locations.map((l) => l.group),
    )
  }

  function clearAll() {
    if (!selectedTeam) return
    save(selectedTeam.id, [])
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl" aria-hidden>
          📍
        </span>
        <h2 className="text-lg font-bold text-text-dark">장소 배정</h2>
      </div>

      <div className="rounded-2xl bg-white border border-text-dark/10 px-4 py-3">
        <p className="text-xs font-bold text-text-dark/50">안내</p>
        <p className="mt-1 text-sm text-text-dark/70 leading-relaxed">
          2일차 장소별 미션에서 <b>각 팀이 진행할 장소</b>를 지정합니다. 배정되지
          않은 장소는 참가자 화면에서 🔒 로 표시되고 선택할 수 없어요. 한 곳도
          배정하지 않으면(빈 목록) 해당 팀은 어떤 장소도 진행할 수 없습니다.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-text-dark/50">
          불러오는 중...
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-sm font-semibold text-[#E94B3C]">{error}</p>
          <button
            type="button"
            onClick={fetchAll}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col lg:flex-row gap-4">
          {/* 좌측: 팀 목록 */}
          <div className="lg:w-80 shrink-0 rounded-2xl bg-white border border-text-dark/10 overflow-hidden">
            <div className="px-4 py-2.5 bg-cream border-b border-text-dark/10">
              <p className="text-xs font-bold text-text-dark/70">
                👥 팀 목록 ({teams.length})
              </p>
            </div>
            {teams.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-bold text-text-dark/50">
                  등록된 팀이 없어요
                </p>
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {teams.map((t) => {
                  const active = t.id === selectedTeamId
                  const list = toStringArray(t.assigned_locations)
                  return (
                    <li key={t.id} className="border-b border-text-dark/5 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setSelectedTeamId(t.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          active ? 'bg-orange-main/10' : 'hover:bg-cream/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-text-dark/40 tabular-nums">
                            {t.start_order ?? '—'}
                          </span>
                          <span
                            className={`text-sm font-bold truncate ${
                              active ? 'text-orange-main' : 'text-text-dark'
                            }`}
                          >
                            {t.team_name}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {list === null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-text-dark/8 text-text-dark/50 text-[11px] font-bold">
                              미설정 (전체 허용)
                            </span>
                          ) : list.length === 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#E94B3C]/10 text-[#E94B3C] text-[11px] font-bold">
                              배정 없음
                            </span>
                          ) : (
                            list.map((g) => (
                              <span
                                key={g}
                                className="inline-flex items-center px-2 py-0.5 rounded-full bg-mint-light text-[#2C7846] text-[11px] font-bold"
                              >
                                {g}
                              </span>
                            ))
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 우측: 장소 체크박스 */}
          <div className="flex-1 min-w-0 rounded-2xl bg-white border border-text-dark/10 overflow-hidden">
            <div className="px-4 py-2.5 bg-cream border-b border-text-dark/10 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-text-dark/70 truncate">
                🗺️ 장소 목록 ({locations.length})
                {selectedTeam && (
                  <>
                    <span className="text-text-dark/30 mx-1.5">·</span>
                    <span className="text-orange-main">{selectedTeam.team_name}</span>
                  </>
                )}
              </p>
              {selectedTeam && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={assignAll}
                    disabled={busy || locations.length === 0}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-orange-main text-white hover:bg-orange-sub disabled:opacity-50"
                  >
                    전체 배정
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-text-dark/15 text-text-dark/60 hover:border-[#E94B3C] hover:text-[#E94B3C] disabled:opacity-50"
                  >
                    전체 해제
                  </button>
                </div>
              )}
            </div>

            {!selectedTeam ? (
              <div className="py-20 text-center">
                <div className="text-4xl mb-3" aria-hidden>
                  👈
                </div>
                <p className="text-sm font-bold text-text-dark/60">
                  왼쪽에서 팀을 먼저 선택해 주세요
                </p>
              </div>
            ) : locations.length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-4xl mb-3" aria-hidden>
                  📭
                </div>
                <p className="text-sm font-bold text-text-dark/60">
                  2일차 장소가 없어요
                </p>
                <p className="mt-1 text-xs text-text-dark/50">
                  미션 관리에서 day_number=2, location_group 을 지정해 주세요
                </p>
              </div>
            ) : (
              <ul className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {locations.map((loc) => {
                  const checked = (selectedAssigned ?? []).includes(loc.group)
                  return (
                    <li key={loc.group}>
                      <label
                        className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
                          checked
                            ? 'border-orange-main bg-orange-main/5'
                            : 'border-text-dark/10 hover:border-orange-main/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => toggle(loc.group)}
                          className="w-5 h-5 shrink-0 accent-[var(--color-orange-main)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-text-dark truncate">
                            {loc.group}
                          </span>
                          <span className="block text-[11px] font-semibold text-text-dark/50 tabular-nums">
                            슬롯 {loc.slotCount}개
                            {loc.order !== 9999 && ` · 순서 ${loc.order}`}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}

            {selectedTeam && selectedAssigned === null && (
              <p className="px-4 pb-4 text-xs font-semibold text-text-dark/50">
                이 팀은 아직 배정 정보가 없어(null) 모든 장소에 접근할 수 있습니다.
                체크박스를 한 번 누르면 배정이 시작돼요.
              </p>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-text-dark text-white text-sm font-semibold shadow-lg max-w-[90vw] text-center"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
