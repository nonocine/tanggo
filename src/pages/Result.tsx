import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'
import type { Quiz } from '../lib/quizTypes'
import { MISSION_SUBTYPE_EMOJI, QUIZ_TYPE_EMOJI } from '../lib/quizTypes'

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 30 * 60 * 1000 // 30분

interface AnswerRow {
  id: string
  team_id: string
  quiz_id: string
  submitted: string
  is_correct: boolean
  answered_at: string
}

interface MissionRequestRow {
  id: string
  team_id: string
  quiz_id: string
  status: 'pending' | 'approved' | 'rejected'
  processed_at: string | null
  note: string | null
  media_url: string | null
  media_type: 'video' | 'photo' | null
}

interface TeamRow {
  id: string
  team_name: string
  started_at: string | null
  finished_at: string | null
}

interface RankTeamRow {
  id: string
  team_name: string
  started_at: string | null
  finished_at: string | null
}

interface RankAnswerRow {
  team_id: string
  is_correct: boolean
  answered_at: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatElapsed(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}시간 ${pad(m)}분 ${pad(s)}초`
  return `${m}분 ${pad(s)}초`
}

export default function Result() {
  const navigate = useNavigate()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)
  const memberName = useTeamStore((s) => s.memberName)

  const [team, setTeam] = useState<TeamRow | null>(null)
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [answersMap, setAnswersMap] = useState<Map<string, AnswerRow>>(new Map())
  const [requestsMap, setRequestsMap] = useState<
    Map<string, MissionRequestRow>
  >(new Map())
  const [rank, setRank] = useState<number | null>(null)
  const [totalTeams, setTotalTeams] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!teamId) return
    const [teamRes, quizzesRes, answersRes, requestsRes, allTeamsRes, allAnswersRes] =
      await Promise.all([
        supabase
          .from('tanggo_teams')
          .select('id, team_name, started_at, finished_at')
          .eq('id', teamId)
          .maybeSingle(),
        supabase
          .from('tanggo_quizzes')
          .select('*')
          .eq('is_active', true)
          .order('order_num', { ascending: true }),
        supabase.from('tanggo_answers').select('*').eq('team_id', teamId),
        supabase
          .from('tanggo_mission_requests')
          .select(
            'id, team_id, quiz_id, status, processed_at, note, media_url, media_type',
          )
          .eq('team_id', teamId),
        supabase
          .from('tanggo_teams')
          .select('id, team_name, started_at, finished_at'),
        supabase
          .from('tanggo_answers')
          .select('team_id, is_correct, answered_at')
          .eq('is_correct', true),
      ])

    const firstErr =
      teamRes.error ||
      quizzesRes.error ||
      answersRes.error ||
      requestsRes.error ||
      allTeamsRes.error ||
      allAnswersRes.error
    if (firstErr) {
      setError(firstErr.message)
      setLoading(false)
      return
    }

    if (teamRes.data) setTeam(teamRes.data as TeamRow)
    setQuizzes((quizzesRes.data ?? []) as Quiz[])

    const aMap = new Map<string, AnswerRow>()
    for (const a of (answersRes.data ?? []) as AnswerRow[]) {
      aMap.set(a.quiz_id, a)
    }
    setAnswersMap(aMap)

    const rMap = new Map<string, MissionRequestRow>()
    for (const r of (requestsRes.data ?? []) as MissionRequestRow[]) {
      const prev = rMap.get(r.quiz_id)
      // 승인된 요청 우선, 그 다음 최신 processed_at
      const prevApproved = prev?.status === 'approved'
      const curApproved = r.status === 'approved'
      if (!prev) {
        rMap.set(r.quiz_id, r)
      } else if (curApproved && !prevApproved) {
        rMap.set(r.quiz_id, r)
      } else if (curApproved === prevApproved) {
        const prevTs = prev.processed_at ?? ''
        const curTs = r.processed_at ?? ''
        if (curTs > prevTs) rMap.set(r.quiz_id, r)
      }
    }
    setRequestsMap(rMap)

    // 순위 계산
    const allTeams = (allTeamsRes.data ?? []) as RankTeamRow[]
    const allAnswers = (allAnswersRes.data ?? []) as RankAnswerRow[]
    const byTeam = new Map<string, { correct: number; last: string | null }>()
    for (const a of allAnswers) {
      const cur = byTeam.get(a.team_id) ?? { correct: 0, last: null }
      cur.correct += 1
      if (a.answered_at && (!cur.last || a.answered_at > cur.last)) {
        cur.last = a.answered_at
      }
      byTeam.set(a.team_id, cur)
    }
    const ranked = allTeams
      .map((t) => ({
        id: t.id,
        correct: byTeam.get(t.id)?.correct ?? 0,
        tiebreak: t.finished_at ?? byTeam.get(t.id)?.last ?? '￿',
      }))
      .sort((a, b) => {
        if (b.correct !== a.correct) return b.correct - a.correct
        return a.tiebreak.localeCompare(b.tiebreak)
      })
    const myIdx = ranked.findIndex((r) => r.id === teamId)
    setRank(myIdx >= 0 ? myIdx + 1 : null)
    setTotalTeams(allTeams.length)

    setError(null)
    setLoading(false)
  }, [teamId])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS)
    const stop = setTimeout(() => clearInterval(interval), POLL_TIMEOUT_MS)
    return () => {
      clearInterval(interval)
      clearTimeout(stop)
    }
  }, [fetchAll])

  const correctCount = useMemo(() => {
    let c = 0
    for (const q of quizzes) {
      if (answersMap.get(q.id)?.is_correct) c++
    }
    return c
  }, [quizzes, answersMap])

  const total = quizzes.length
  const pct = total === 0 ? 0 : Math.round((correctCount / total) * 100)

  if (!teamId) {
    return null
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AnnouncementBanner />

      <header className="px-4 pt-5 text-center">
        <p className="text-sm font-bold text-text-dark/60">🏁 미션 완료!</p>
        <h1 className="mt-1 text-2xl font-black text-text-dark">
          {teamName ?? team?.team_name ?? '???'}
        </h1>
        {memberName && (
          <p className="mt-1 text-sm font-bold text-orange-main">
            {memberName}님, 수고하셨어요! 🙌
          </p>
        )}
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-5">
        {loading ? (
          <div className="py-16 text-center text-sm text-text-dark/50">
            결과 집계 중...
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
          <>
            {/* 결과 카드 */}
            <section
              className="relative rounded-3xl border-4 border-orange-main bg-white px-6 pt-10 pb-6 text-center"
              style={{ boxShadow: 'var(--shadow-orange)' }}
            >
              <div
                aria-hidden
                className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center"
              >
                <div className="w-24 h-6 rounded-lg bg-gradient-to-b from-gray-300 to-gray-400 shadow-md" />
                <div className="w-3 h-2 -mt-0.5 rounded-b-sm bg-gray-400" />
              </div>

              <div className="text-5xl" aria-hidden>
                🏆
              </div>
              <h2 className="mt-2 text-xl font-black text-text-dark">
                {team?.team_name ?? teamName}
              </h2>

              <div className="mt-5 inline-flex items-baseline gap-1">
                <span className="text-5xl font-black text-orange-main tabular-nums">
                  {correctCount}
                </span>
                <span className="text-xl font-bold text-text-dark/40">
                  {' '}
                  / {total}
                </span>
              </div>
              <p className="mt-1 text-base font-bold text-text-dark">
                {pct}% 달성!
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-cream px-3 py-3">
                  <p className="text-[11px] font-bold text-text-dark/50">
                    소요 시간
                  </p>
                  <p className="mt-0.5 text-base font-black text-text-dark tabular-nums">
                    {formatElapsed(team?.started_at ?? null, team?.finished_at ?? null)}
                  </p>
                </div>
                <div className="rounded-2xl bg-cream px-3 py-3">
                  <p className="text-[11px] font-bold text-text-dark/50">
                    현재 순위
                  </p>
                  <p className="mt-0.5 text-base font-black text-text-dark tabular-nums">
                    {rank !== null ? `${rank}위` : '—'}
                    <span className="text-xs font-bold text-text-dark/40">
                      {' '}
                      / {totalTeams}팀
                    </span>
                  </p>
                </div>
              </div>
              {rank !== null && totalTeams > 0 && (
                <p className="mt-3 text-[11px] text-text-dark/40">
                  순위는 5초마다 자동 갱신됩니다
                </p>
              )}
            </section>

            {/* 미션별 결과 */}
            {quizzes.length > 0 && (
              <section className="mt-6">
                <h3 className="text-sm font-bold text-text-dark/70 mb-3 px-1">
                  미션별 결과
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quizzes.map((q) => (
                    <MissionResultCard
                      key={q.id}
                      quiz={q}
                      answer={answersMap.get(q.id)}
                      missionRequest={requestsMap.get(q.id)}
                      onOpenLightbox={(url) => setLightboxUrl(url)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 라이트박스 */}
            {lightboxUrl && (
              <div
                className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
                onClick={() => setLightboxUrl(null)}
              >
                <img
                  src={lightboxUrl}
                  alt="확대 보기"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setLightboxUrl(null)}
                  aria-label="닫기"
                  className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 text-text-dark text-2xl"
                >
                  ×
                </button>
              </div>
            )}

            {/* 하단 */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-2xl bg-orange-main text-white text-base font-bold hover:bg-orange-sub active:scale-[0.98] transition-all"
                style={{ boxShadow: 'var(--shadow-orange-sm)' }}
              >
                🏠 홈으로
              </button>
              <p className="text-[11px] text-text-dark/40 text-center">
                팀 이름이 기억나면 "우리 팀 들어가기"로 다시 볼 수 있어요
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function MissionResultCard({
  quiz,
  answer,
  missionRequest,
  onOpenLightbox,
}: {
  quiz: Quiz
  answer: AnswerRow | undefined
  missionRequest: MissionRequestRow | undefined
  onOpenLightbox: (url: string) => void
}) {
  const correct = !!answer?.is_correct
  const rejected =
    quiz.type === 'mission' && missionRequest?.status === 'rejected'
  const typeIcon =
    quiz.type === 'mission' && quiz.mission_subtype
      ? MISSION_SUBTYPE_EMOJI[quiz.mission_subtype]
      : QUIZ_TYPE_EMOJI[quiz.type]

  let toneCls = 'border-text-dark/10 bg-white'
  let badge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-text-dark/8 text-text-dark/60">
      🟡 미완료
    </span>
  )
  if (correct) {
    toneCls = 'border-mint/40 bg-mint/5'
    badge = (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-mint/25 text-[#2C7846]">
        {quiz.type === 'mission' ? '🎬 승인됨' : '✅ 정답'}
      </span>
    )
  } else if (rejected) {
    toneCls = 'border-[#E94B3C]/30 bg-[#E94B3C]/5'
    badge = (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E94B3C]/15 text-[#E94B3C]">
        ❌ 승인되지 않음
      </span>
    )
  }

  return (
    <div className={`rounded-2xl border-2 p-3 ${toneCls}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-orange-main tabular-nums">
          #{quiz.order_num}{' '}
          <span aria-hidden className="ml-0.5">
            {typeIcon}
          </span>
        </p>
        {badge}
      </div>
      <p className="mt-1 text-sm font-semibold text-text-dark line-clamp-2">
        {quiz.question}
      </p>
      {correct && answer?.submitted && answer.submitted !== '[현장미션승인]' && (
        <p className="mt-1.5 text-[11px] text-text-dark/60 truncate">
          제출:{' '}
          <span className="font-bold text-text-dark/80">{answer.submitted}</span>
        </p>
      )}
      {!correct && quiz.type !== 'mission' && quiz.answer && (
        <p className="mt-1.5 text-[11px] text-text-dark/60 truncate">
          정답:{' '}
          <span className="font-bold text-text-dark/80">
            {quiz.type === 'choice' && quiz.choices
              ? `${quiz.answer}번 (${quiz.choices[Number(quiz.answer) - 1] ?? '?'})`
              : quiz.answer}
          </span>
        </p>
      )}
      {rejected && missionRequest?.note && (
        <p className="mt-1.5 text-[11px] text-text-dark/60 italic line-clamp-1">
          "{missionRequest.note}"
        </p>
      )}

      {/* 제출한 미디어 썸네일 */}
      {quiz.type === 'mission' &&
        missionRequest?.media_url &&
        missionRequest.media_type === 'photo' && (
          <button
            type="button"
            onClick={() => onOpenLightbox(missionRequest.media_url!)}
            className="mt-2 block rounded-lg overflow-hidden bg-black cursor-zoom-in w-full"
            aria-label="제출한 사진 확대 보기"
          >
            <img
              src={missionRequest.media_url}
              alt="제출한 사진"
              loading="lazy"
              className="w-full h-24 object-cover"
            />
          </button>
        )}
      {quiz.type === 'mission' &&
        missionRequest?.media_url &&
        missionRequest.media_type === 'video' && (
          <video
            src={missionRequest.media_url}
            controls
            playsInline
            preload="metadata"
            className="mt-2 w-full rounded-lg bg-black max-h-48 object-contain"
          />
        )}
    </div>
  )
}
