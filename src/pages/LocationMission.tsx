import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'
import MissionSlot, {
  isSlotDone,
  latestRequestByQuiz,
} from '../components/MissionSlot'
import type { AnswerRow, MissionRequestRow } from '../components/MissionSlot'
import type { Quiz } from '../lib/quizTypes'

const POLL_INTERVAL_MS = 5000

export default function LocationMission() {
  const navigate = useNavigate()
  const params = useParams<{ locationGroup: string }>()
  const locationGroup = decodeURIComponent(params.locationGroup ?? '')
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)

  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [answersMap, setAnswersMap] = useState<Map<string, AnswerRow>>(new Map())
  const [requestsMap, setRequestsMap] = useState<Map<string, MissionRequestRow>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [celebrateSeen, setCelebrateSeen] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!teamId || !locationGroup) return
    const [quizzesRes, answersRes, requestsRes] = await Promise.all([
      supabase
        .from('tanggo_quizzes')
        .select('*')
        .eq('is_active', true)
        .eq('day_number', 2)
        .eq('location_group', locationGroup)
        .order('slot_order', { ascending: true }),
      supabase.from('tanggo_answers').select('*').eq('team_id', teamId),
      supabase.from('tanggo_mission_requests').select('*').eq('team_id', teamId),
    ])

    const firstErr = quizzesRes.error || answersRes.error || requestsRes.error
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
    setLoading(false)
  }, [teamId, locationGroup])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  // requires_approval_to_proceed 게이트 — 승인 안 된 관문 슬롯 이후는 잠김
  const slots = useMemo(() => {
    let blocked = false
    return quizzes.map((q) => {
      const answer = answersMap.get(q.id) ?? null
      const request = requestsMap.get(q.id) ?? null
      const done = isSlotDone(q, answer, request)
      const locked = blocked
      if (q.requires_approval_to_proceed && !done) blocked = true
      return { quiz: q, answer, request, done, locked }
    })
  }, [quizzes, answersMap, requestsMap])

  const doneCount = slots.filter((s) => s.done).length
  const total = slots.length
  const allDone = total > 0 && doneCount === total
  const progressPct = total === 0 ? 0 : Math.round((doneCount / total) * 100)

  if (!teamId) return null

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AnnouncementBanner />

      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-white border-b border-text-dark/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/location-select')}
            className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold text-text-dark/60 border border-text-dark/10 hover:bg-cream hover:text-text-dark"
          >
            ← 장소 선택
          </button>
          <p className="min-w-0 flex-1 text-center text-sm font-black text-text-dark truncate">
            📍 {locationGroup || '장소'}
          </p>
          <p className="shrink-0 text-xs font-bold text-text-dark/70 tabular-nums">
            <span className="text-orange-main">{doneCount}</span>
            <span className="text-text-dark/40">/{total}</span>
          </p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-text-dark/10 overflow-hidden">
          <div
            className="h-full bg-orange-main transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-text-dark/45 text-center">
          🏷️ {teamName ?? '???'} 팀 · 순서대로 진행해 주세요
        </p>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-4">
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
        ) : slots.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/60">
              이 장소에 등록된 미션이 없어요
            </p>
            <button
              type="button"
              onClick={() => navigate('/location-select')}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-white"
            >
              장소 선택으로 돌아가기
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {slots.map((s, idx) => (
              <MissionSlot
                key={s.quiz.id}
                quiz={s.quiz}
                teamId={teamId}
                existingRequest={s.request}
                existingAnswer={s.answer}
                locked={s.locked}
                slotIndex={idx + 1}
                onChanged={fetchAll}
              />
            ))}
          </ul>
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

      {/* 전체 슬롯 완료 축하 모달 */}
      {allDone && !celebrateSeen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm bg-white rounded-3xl border-4 border-orange-main px-6 pt-8 pb-6 text-center animate-slide-in-down"
            style={{ boxShadow: 'var(--shadow-orange)' }}
          >
            <div className="text-7xl mb-3" aria-hidden>
              🎉
            </div>
            <h2 className="text-2xl font-black text-orange-main">
              장소 미션 완료!
            </h2>
            <p className="mt-2 text-sm text-text-dark/70">
              <span className="font-bold text-text-dark">{locationGroup}</span> 의
              모든 미션을 완료했어요
            </p>
            <button
              type="button"
              onClick={() => navigate('/location-select')}
              className="mt-6 w-full rounded-2xl bg-orange-main py-3.5 text-base font-bold text-white hover:bg-orange-sub active:scale-[0.98] transition-all"
              style={{ boxShadow: 'var(--shadow-orange-sm)' }}
            >
              🗺️ 장소 선택으로 돌아가기
            </button>
            <button
              type="button"
              onClick={() => setCelebrateSeen(true)}
              className="mt-2 w-full py-2 text-xs font-semibold text-text-dark/40 hover:text-text-dark/70"
            >
              이 장소에 머무르기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
