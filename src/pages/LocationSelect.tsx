import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'
import type { Quiz } from '../lib/quizTypes'
import type { AnswerRow, MissionRequestRow } from '../components/MissionSlot'
import { isSlotDone, latestRequestByQuiz } from '../components/MissionSlot'

const POLL_INTERVAL_MS = 5000

interface LocationCard {
  group: string
  order: number
  slotCount: number
  doneCount: number
  hint: string | null
}

export default function LocationSelect() {
  const navigate = useNavigate()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)

  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [answersMap, setAnswersMap] = useState<Map<string, AnswerRow>>(new Map())
  const [requestsMap, setRequestsMap] = useState<Map<string, MissionRequestRow>>(
    new Map(),
  )
  const [assigned, setAssigned] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockedModal, setBlockedModal] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!teamId) return
    const [quizzesRes, answersRes, requestsRes, teamRes] = await Promise.all([
      supabase
        .from('tanggo_quizzes')
        .select('*')
        .eq('is_active', true)
        .eq('day_number', 2)
        .order('location_group_order', { ascending: true, nullsFirst: false })
        .order('slot_order', { ascending: true }),
      supabase.from('tanggo_answers').select('*').eq('team_id', teamId),
      supabase.from('tanggo_mission_requests').select('*').eq('team_id', teamId),
      supabase
        .from('tanggo_teams')
        .select('assigned_locations')
        .eq('id', teamId)
        .maybeSingle(),
    ])

    const firstErr =
      quizzesRes.error || answersRes.error || requestsRes.error || teamRes.error
    if (firstErr) {
      setError(firstErr.message)
      setLoading(false)
      return
    }
    setError(null)
    setQuizzes((quizzesRes.data ?? []) as Quiz[])

    const aMap = new Map<string, AnswerRow>()
    for (const a of (answersRes.data ?? []) as AnswerRow[]) {
      aMap.set(a.quiz_id, a)
    }
    setAnswersMap(aMap)
    setRequestsMap(
      latestRequestByQuiz((requestsRes.data ?? []) as MissionRequestRow[]),
    )

    const raw = teamRes.data?.assigned_locations
    // null 이면 배정 정보 없음 → 전체 접근 허용 (개발/테스트용)
    setAssigned(
      Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : null,
    )

    setLoading(false)
  }, [teamId])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  // 장소별 집계 — 대표 슬롯(slot_order=1)에서 순서/힌트를 가져오고 완료 수는 전체 슬롯 기준
  const locations = useMemo<LocationCard[]>(() => {
    const byGroup = new Map<string, Quiz[]>()
    for (const q of quizzes) {
      if (!q.location_group) continue
      const arr = byGroup.get(q.location_group) ?? []
      arr.push(q)
      byGroup.set(q.location_group, arr)
    }
    const cards: LocationCard[] = []
    for (const [group, slots] of byGroup) {
      const lead =
        slots.find((s) => (s.slot_order ?? 1) === 1) ??
        [...slots].sort((a, b) => (a.slot_order ?? 1) - (b.slot_order ?? 1))[0]
      const doneCount = slots.filter((s) =>
        isSlotDone(s, answersMap.get(s.id), requestsMap.get(s.id)),
      ).length
      cards.push({
        group,
        order: lead?.location_group_order ?? 9999,
        slotCount: slots.length,
        doneCount,
        hint: lead?.location_hint ?? null,
      })
    }
    return cards.sort((a, b) => a.order - b.order || a.group.localeCompare(b.group))
  }, [quizzes, answersMap, requestsMap])

  function isAssigned(group: string): boolean {
    if (assigned === null) return true
    return assigned.includes(group)
  }

  function handleSelect(group: string) {
    if (!isAssigned(group)) {
      setBlockedModal(true)
      return
    }
    navigate(`/location-mission/${encodeURIComponent(group)}`)
  }

  if (!teamId) return null

  const doneTotal = locations.filter(
    (l) => l.slotCount > 0 && l.doneCount >= l.slotCount,
  ).length

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AnnouncementBanner />

      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-white border-b border-text-dark/10 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-text-dark truncate">
            🏷️ {teamName ?? '???'} 팀
          </p>
          <p className="text-xs font-bold text-text-dark/70 tabular-nums">
            <span className="text-orange-main">{doneTotal}</span>
            <span className="text-text-dark/40"> / {locations.length}</span> 장소 완료
          </p>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-4">
        <div className="text-center">
          <h1 className="text-xl font-black text-text-dark">🗺️ 장소를 선택하세요</h1>
          <p className="mt-1.5 text-sm text-text-dark/60">
            우리 조에 배정된 장소만 진행할 수 있어요
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
        ) : locations.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/60">
              아직 등록된 장소가 없어요
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            {locations.map((loc) => {
              const mine = isAssigned(loc.group)
              const complete = loc.slotCount > 0 && loc.doneCount >= loc.slotCount
              const skinCls = complete
                ? 'border-mint bg-mint-light/30'
                : mine
                  ? 'border-orange-main bg-white'
                  : 'border-text-dark/10 bg-text-dark/[0.04]'
              return (
                <button
                  key={loc.group}
                  type="button"
                  onClick={() => handleSelect(loc.group)}
                  className={`text-left rounded-2xl border-2 p-3.5 hover:-translate-y-0.5 active:translate-y-0 transition-all ${skinCls}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-2xl" aria-hidden>
                      {complete ? '✅' : mine ? '📍' : '🔒'}
                    </span>
                    <span className="text-[11px] font-bold text-text-dark/50 tabular-nums">
                      {loc.doneCount}/{loc.slotCount}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-sm font-black line-clamp-2 ${
                      mine ? 'text-text-dark' : 'text-text-dark/40'
                    }`}
                  >
                    {loc.group}
                  </p>
                  {loc.hint && (
                    <p className="mt-1 text-[11px] font-bold text-text-dark/50 truncate">
                      📍 {loc.hint}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] font-bold">
                    {complete ? (
                      <span className="text-[#2C7846]">완료</span>
                    ) : mine ? (
                      <span className="text-orange-main">진행하기 →</span>
                    ) : (
                      <span className="text-text-dark/40">미배정</span>
                    )}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {/* 하단 네비게이션 */}
        <div className="mt-8 mb-8 flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/lobby')}
            className="flex-1 py-3 rounded-2xl border-2 border-text-dark/20 text-text-dark text-sm font-bold hover:bg-white active:scale-[0.99] transition-all"
          >
            🏠 대기실로 돌아가기
          </button>
          <button
            type="button"
            onClick={() => navigate('/day-select')}
            className="flex-1 py-3 rounded-2xl border-2 border-orange-main text-orange-main text-sm font-bold hover:bg-orange-main/5 active:scale-[0.99] transition-all"
          >
            📅 일차 선택하기
          </button>
        </div>
      </main>

      {/* 미배정 장소 안내 모달 */}
      {blockedModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setBlockedModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl border-4 border-orange-main px-6 pt-8 pb-5 text-center"
            style={{ boxShadow: 'var(--shadow-orange)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl" aria-hidden>
              🔒
            </div>
            <h2 className="mt-3 text-lg font-black text-text-dark">
              배정된 장소가 아니에요
            </h2>
            <p className="mt-2 text-sm text-text-dark/70 leading-relaxed">
              우리 조에 배정된 장소가 아닙니다.
              <br />
              배정된 장소를 선택해 주세요.
            </p>
            <button
              type="button"
              onClick={() => setBlockedModal(false)}
              className="mt-5 w-full rounded-2xl bg-orange-main py-3 text-base font-bold text-white hover:bg-orange-sub"
              style={{ boxShadow: 'var(--shadow-orange-sm)' }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
