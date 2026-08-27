import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'
import type { Quiz } from '../lib/quizTypes'
import {
  MISSION_SUBTYPE_EMOJI,
  MISSION_SUBTYPE_LABEL,
  QUIZ_TYPE_EMOJI,
  QUIZ_TYPE_LABEL,
} from '../lib/quizTypes'
import {
  MAX_MISSION_MEDIA_BYTES,
  formatBytes,
  uploadMissionMedia,
} from '../lib/missionMedia'
import type { MemberVoteRow } from '../lib/memberVotes'
import {
  checkAllAgreed,
  fetchVotesForQuiz,
  upsertMyVote,
} from '../lib/memberVotes'

const POLL_INTERVAL_MS = 5000

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
  requested_at: string
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
  leader_name: string | null
  member_count: number | null
}

interface EventConfigRow {
  service_ended: boolean
}

type CardStatus = 'submitted' | 'awaiting' | 'todo'

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function checkAnswer(quiz: Quiz, submitted: string): boolean {
  if (quiz.type === 'text') {
    const subN = normalize(submitted)
    if (!subN) return false
    if (quiz.answer && normalize(quiz.answer) === subN) return true
    if (quiz.answer_variants) {
      return quiz.answer_variants.some((v) => normalize(v) === subN)
    }
    return false
  }
  if (quiz.type === 'choice') {
    return (quiz.answer ?? '').trim() === submitted.trim()
  }
  return false
}

function cardStatusOf(
  quiz: Quiz,
  answer: AnswerRow | undefined,
  req: MissionRequestRow | undefined,
): CardStatus {
  if (quiz.type === 'mission') {
    if (req?.status === 'pending') return 'awaiting'
    if (answer || req?.status === 'rejected') return 'submitted'
    return 'todo'
  }
  return answer ? 'submitted' : 'todo'
}

function StatusBadge({ status }: { status: CardStatus }) {
  if (status === 'submitted')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-text-dark/10 text-text-dark/60">
        🔒 제출 완료
      </span>
    )
  if (status === 'awaiting')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F4C430]/20 text-[#A88300]">
        🕐 승인 대기
      </span>
    )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-text-dark/8 text-text-dark/50">
      🟡 미완료
    </span>
  )
}

export default function Mission() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)
  const memberName = useTeamStore((s) => s.memberName)

  // ?day=1 — 멀티 데이 모드에서 해당 일차 미션만 표시한다 (없으면 기존처럼 전체)
  const dayParam = searchParams.get('day')
  const dayNumber =
    dayParam !== null && Number.isFinite(Number(dayParam)) ? Number(dayParam) : null

  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [answersMap, setAnswersMap] = useState<Map<string, AnswerRow>>(new Map())
  const [requestsMap, setRequestsMap] = useState<Map<string, MissionRequestRow>>(
    new Map(),
  )
  const [hintSeen, setHintSeen] = useState<Set<string>>(new Set())
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [votesMap, setVotesMap] = useState<Map<string, MemberVoteRow[]>>(new Map())
  const [team, setTeam] = useState<TeamRow | null>(null)
  const [config, setConfig] = useState<EventConfigRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openQuiz, setOpenQuiz] = useState<Quiz | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const finishingRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!teamId) return
    let quizQuery = supabase
      .from('tanggo_quizzes')
      .select('*')
      .eq('is_active', true)
    if (dayNumber === 1) {
      // 1일차 = 기존 탐GO 미션. Phase 2 이전에 등록된 문항은 day_number 가 null 이라
      // day_number=1 로만 거르면 한 건도 안 잡힌다 (→ "등록된 미션이 없어요" 버그)
      quizQuery = quizQuery.or('day_number.eq.1,day_number.is.null')
    } else if (dayNumber !== null) {
      quizQuery = quizQuery.eq('day_number', dayNumber)
    } else {
      // day 파라미터 없음 = 기존 탐GO single 모드: day_number 가 null 인 것만
      quizQuery = quizQuery.is('day_number', null)
    }

    const [
      quizzesRes,
      answersRes,
      requestsRes,
      hintsRes,
      teamRes,
      configRes,
      membersRes,
    ] = await Promise.all([
        quizQuery.order('order_num', { ascending: true }),
        supabase.from('tanggo_answers').select('*').eq('team_id', teamId),
        supabase
          .from('tanggo_mission_requests')
          .select('*')
          .eq('team_id', teamId),
        supabase
          .from('tanggo_hint_requests')
          .select('quiz_id')
          .eq('team_id', teamId),
        supabase
          .from('tanggo_teams')
          .select(
            'id, team_name, started_at, finished_at, leader_name, member_count',
          )
          .eq('id', teamId)
          .maybeSingle(),
        supabase
          .from('tanggo_event_config')
          .select('service_ended')
          .eq('id', 1)
          .maybeSingle(),
        supabase
          .from('tanggo_team_members')
          .select('name, created_at')
          .eq('team_id', teamId)
          .order('created_at', { ascending: true }),
      ])

    const firstErr =
      quizzesRes.error ||
      answersRes.error ||
      requestsRes.error ||
      hintsRes.error ||
      teamRes.error ||
      configRes.error
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

    const rMap = new Map<string, MissionRequestRow>()
    for (const r of (requestsRes.data ?? []) as MissionRequestRow[]) {
      // 최신 요청만 유지 (한 미션에 여러 요청 있으면 최근 것)
      const prev = rMap.get(r.quiz_id)
      if (!prev || r.requested_at > prev.requested_at) rMap.set(r.quiz_id, r)
    }
    setRequestsMap(rMap)

    const hSet = new Set<string>()
    for (const h of (hintsRes.data ?? []) as { quiz_id: string }[]) {
      hSet.add(h.quiz_id)
    }
    setHintSeen(hSet)

    if (teamRes.data) setTeam(teamRes.data as TeamRow)
    if (configRes.data) setConfig(configRes.data as EventConfigRow)
    setMemberNames(
      ((membersRes.data ?? []) as { name: string }[]).map((m) => m.name),
    )

    setLoading(false)
  }, [teamId, dayNumber])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  const reloadVotes = useCallback(
    async (quizId: string) => {
      if (!teamId) return
      const votes = await fetchVotesForQuiz(teamId, quizId)
      setVotesMap((prev) => new Map(prev).set(quizId, votes))
    },
    [teamId],
  )

  // 열린 문제의 팀원 투표 현황 구독 (현장 미션은 투표 불필요)
  useEffect(() => {
    if (!openQuiz || !teamId) return
    if (openQuiz.type === 'mission') return
    const quizId = openQuiz.id

    reloadVotes(quizId)

    const channel = supabase
      .channel(`votes-${teamId}-${quizId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'tanggo',
          table: 'tanggo_member_votes',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          reloadVotes(quizId)
        },
      )
      .subscribe()

    // Realtime 이 막혀 있어도 현황이 갱신되도록 폴링 백업
    const t = setInterval(() => reloadVotes(quizId), POLL_INTERVAL_MS)

    return () => {
      clearInterval(t)
      supabase.removeChannel(channel)
    }
  }, [openQuiz, teamId, reloadVotes])

  // 방장 판정 — leader_name 이 없는 예전 팀은 전원이 제출 가능
  const leaderName = team?.leader_name ?? null
  const isLeader = !leaderName || (!!memberName && memberName === leaderName)
  const totalMembers =
    memberNames.length > 0 ? memberNames.length : (team?.member_count ?? 0)

  // 제출이 끝난(확정된) 미션 수 — 정답/오답과 무관.
  // text/choice: 답안 제출됨 / mission: 승인(답안 생성) 또는 거절. 승인 대기는 미확정.
  const finalizedCount = useMemo(() => {
    let c = 0
    for (const q of quizzes) {
      const ans = answersMap.get(q.id)
      const req = requestsMap.get(q.id)
      if (q.type === 'mission') {
        if (ans || req?.status === 'rejected') c++
      } else if (ans) {
        c++
      }
    }
    return c
  }, [quizzes, answersMap, requestsMap])

  const total = quizzes.length
  const progressPct = total === 0 ? 0 : Math.round((finalizedCount / total) * 100)

  // 토스트 자동 해제
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // 자동 완료 트리거 — 모든 미션이 확정되면 결과로 이동
  useEffect(() => {
    if (finishingRef.current) return
    if (!team || team.finished_at) return
    if (total === 0) return
    if (finalizedCount < total) return
    finishingRef.current = true
    setCelebrate(true)
    // 멀티 데이(?day=N)에서는 해당 일차만 끝난 것이므로 팀을 종료 처리하지 않는다
    if (dayNumber !== null) return
    supabase
      .from('tanggo_teams')
      .update({ finished_at: new Date().toISOString() })
      .eq('id', team.id)
      .then(() => {
        setTimeout(() => navigate('/result', { replace: true }), 3000)
      })
  }, [finalizedCount, total, team, navigate, dayNumber])

  // service_ended 시 result 화면으로
  useEffect(() => {
    if (config?.service_ended && !celebrate) {
      navigate('/result', { replace: true })
    }
  }, [config, celebrate, navigate])

  // team.finished_at 외부 변동 (운영자 강제 종료 등) 시 result로
  useEffect(() => {
    if (!team) return
    if (team.finished_at && !celebrate && !finishingRef.current) {
      navigate('/result', { replace: true })
    }
  }, [team, celebrate, navigate])

  async function handleQuit() {
    if (!team) return
    const ok = window.confirm(
      '지금 종료하면 미완료 미션은 0점 처리됩니다.\n정말 종료하시겠어요?',
    )
    if (!ok) return
    await supabase
      .from('tanggo_teams')
      .update({ finished_at: new Date().toISOString() })
      .eq('id', team.id)
    navigate('/result', { replace: true })
  }

  if (!teamId) {
    return null
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AnnouncementBanner />

      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-white border-b border-text-dark/10 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-text-dark truncate">
            🏷️ {teamName ?? team?.team_name ?? '???'} 팀
          </p>
          <p className="text-xs font-bold text-text-dark/70 tabular-nums">
            <span className="text-orange-main">{finalizedCount}</span>
            <span className="text-text-dark/40"> / {total}</span> 미션 완료
          </p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-text-dark/10 overflow-hidden">
          <div
            className="h-full bg-orange-main transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-4">
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
        ) : quizzes.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/60">
              아직 등록된 미션이 없어요
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quizzes.map((q) => {
              const ans = answersMap.get(q.id)
              const req = requestsMap.get(q.id)
              const status = cardStatusOf(q, ans, req)
              const skinCls =
                status === 'submitted'
                  ? 'border-text-dark/15 bg-text-dark/[0.04]'
                  : status === 'awaiting'
                    ? 'border-[#F4C430] bg-white'
                    : 'border-text-dark/10 bg-white'
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setOpenQuiz(q)}
                  className={`text-left rounded-2xl border-2 p-3 hover:-translate-y-0.5 active:translate-y-0 transition-all ${skinCls}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-black text-orange-main tabular-nums">
                      #{q.order_num}
                    </span>
                    <span className="text-base" aria-hidden>
                      {q.type === 'mission' && q.mission_subtype
                        ? MISSION_SUBTYPE_EMOJI[q.mission_subtype]
                        : QUIZ_TYPE_EMOJI[q.type]}
                    </span>
                  </div>
                  {q.location_hint && (
                    <p className="mt-1.5 text-[11px] font-bold text-text-dark/60 truncate">
                      📍 {q.location_hint}
                    </p>
                  )}
                  <p className="mt-1 text-sm font-semibold text-text-dark line-clamp-2">
                    {q.question}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={status} />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 하단 네비게이션 */}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/lobby')}
            className="flex-1 py-3 rounded-2xl border-2 border-text-dark/20 text-text-dark text-sm font-bold hover:bg-white active:scale-[0.99] transition-all"
          >
            🏠 대기실로 돌아가기
          </button>
          {dayNumber !== null && (
          <button
            type="button"
            onClick={() => navigate('/day-select')}
            className="flex-1 py-3 rounded-2xl border-2 border-orange-main text-orange-main text-sm font-bold hover:bg-orange-main/5 active:scale-[0.99] transition-all"
          >
            📅 일차 선택하기
          </button>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={handleQuit}
            className="text-xs font-semibold text-text-dark/40 hover:text-[#E94B3C] underline"
          >
            🏁 그만하기
          </button>
        </div>
      </main>

      {openQuiz && (
        <QuizSolveModal
          quiz={openQuiz}
          teamId={teamId}
          answer={answersMap.get(openQuiz.id)}
          missionRequest={requestsMap.get(openQuiz.id)}
          hintAlreadySeen={hintSeen.has(openQuiz.id)}
          memberName={memberName}
          memberNames={memberNames}
          totalMembers={totalMembers}
          leaderName={leaderName}
          isLeader={isLeader}
          votes={votesMap.get(openQuiz.id) ?? []}
          onVoted={() => reloadVotes(openQuiz.id)}
          onClose={() => setOpenQuiz(null)}
          onChanged={() => {
            fetchAll()
          }}
          onSubmitted={() => {
            setToast('제출이 완료되었습니다 ✅')
            fetchAll()
          }}
        />
      )}

      {celebrate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border-4 border-orange-main px-6 py-8 text-center animate-slide-in-down">
            <div className="text-7xl mb-3" aria-hidden>
              🎉
            </div>
            <h2 className="text-2xl font-black text-orange-main">
              모든 미션을 완료했어요!
            </h2>
            {dayNumber !== null ? (
              <>
                <p className="mt-2 text-sm text-text-dark/70">
                  {dayNumber}일차 미션을 모두 마쳤어요 🙌
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/day-select', { replace: true })}
                  className="mt-6 w-full rounded-2xl bg-orange-main py-3.5 text-base font-bold text-white hover:bg-orange-sub active:scale-[0.98] transition-all"
                  style={{ boxShadow: 'var(--shadow-orange-sm)' }}
                >
                  📅 일차 선택으로 돌아가기
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-text-dark/70">
                잠시 후 결과 화면으로 이동합니다...
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

function QuizSolveModal({
  quiz,
  teamId,
  answer,
  missionRequest,
  hintAlreadySeen,
  memberName,
  memberNames,
  totalMembers,
  leaderName,
  isLeader,
  votes,
  onVoted,
  onClose,
  onChanged,
  onSubmitted,
}: {
  quiz: Quiz
  teamId: string
  answer: AnswerRow | undefined
  missionRequest: MissionRequestRow | undefined
  hintAlreadySeen: boolean
  memberName: string | null
  memberNames: string[]
  totalMembers: number
  leaderName: string | null
  isLeader: boolean
  votes: MemberVoteRow[]
  onVoted: () => void
  onClose: () => void
  onChanged: () => void
  onSubmitted: () => void
}) {
  const [textAnswer, setTextAnswer] = useState('')
  const [textTouched, setTextTouched] = useState(false)
  const [choiceIdx, setChoiceIdx] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showHint, setShowHint] = useState(hintAlreadySeen)
  const [error, setError] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const missionSubtype = quiz.type === 'mission' ? quiz.mission_subtype : null
  const isUploadKind = missionSubtype === 'video' || missionSubtype === 'photo'

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    }
  }, [mediaPreviewUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isMission = quiz.type === 'mission'
  const missionPending = isMission && missionRequest?.status === 'pending'
  // 한 번 제출하면 잠김 — 정답/오답 무관. mission은 거절도 확정으로 본다.
  const locked = !!answer || (isMission && missionRequest?.status === 'rejected')

  /* ── 전원 동의 투표 ─────────────────────────────────
     본인 이름이 확인된 팀원만 투표에 참여한다.
     memberName 이 없는(예전 저장분) 경우 기존 단독 제출 방식으로 동작. */
  const votingEnabled = !isMission && !!memberName && totalMembers > 0
  const myVote = memberName
    ? (votes.find((v) => v.member_name === memberName) ?? null)
    : null
  const { agreed, answer: agreedAnswer } = checkAllAgreed(votes, totalMembers)
  const textValue = textTouched ? textAnswer : (myVote?.selected_answer ?? textAnswer)
  const selectedIdx =
    choiceIdx ??
    (myVote && quiz.type === 'choice' ? Number(myVote.selected_answer) - 1 : null)

  async function castVote(value: string) {
    if (!memberName || voting || locked || !value.trim()) return
    setVoting(true)
    setError(null)
    try {
      await upsertMyVote(teamId, quiz.id, memberName, value.trim())
      onVoted()
    } catch (e) {
      setError(
        `내 답 저장 실패. 다시 시도해주세요${
          e instanceof Error ? ` (${e.message})` : ''
        }`,
      )
    }
    setVoting(false)
  }

  async function submitAnswer(submitted: string) {
    if (submitting || locked || missionPending) return
    const value = submitted.trim()
    if (!value) return
    setSubmitting(true)
    setError(null)
    const isCorrect = checkAnswer(quiz, value)
    const { error } = await supabase.from('tanggo_answers').insert({
      team_id: teamId,
      quiz_id: quiz.id,
      submitted: value,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    onSubmitted()
    onClose()
  }

  function handleTextSubmit() {
    if (votingEnabled) {
      if (!agreed || !isLeader || !agreedAnswer) return
      submitAnswer(agreedAnswer)
      return
    }
    submitAnswer(textAnswer)
  }

  function handleChoiceSubmit() {
    if (votingEnabled) {
      if (!agreed || !isLeader || !agreedAnswer) return
      submitAnswer(agreedAnswer)
      return
    }
    if (selectedIdx === null) return
    submitAnswer(String(selectedIdx + 1))
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_MISSION_MEDIA_BYTES) {
      setError(
        `파일이 너무 커요 (${formatBytes(f.size)}). 50MB 이하로 올려주세요.`,
      )
      e.target.value = ''
      return
    }
    setError(null)
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(f)
    setMediaPreviewUrl(URL.createObjectURL(f))
  }

  function clearMedia() {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(null)
    setMediaPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleMissionRequest() {
    if (submitting || uploading || locked || missionPending) return
    setError(null)

    let mediaUrl: string | null = null
    let mediaType: 'video' | 'photo' | null = null

    if (isUploadKind) {
      if (!mediaFile) {
        setError(
          missionSubtype === 'video'
            ? '영상을 선택해주세요'
            : '사진을 선택해주세요',
        )
        return
      }
      setUploading(true)
      try {
        const res = await uploadMissionMedia(mediaFile, teamId, quiz.id)
        mediaUrl = res.url
        mediaType = missionSubtype as 'video' | 'photo'
      } catch (e) {
        setError(
          `업로드 실패. 다시 시도해주세요${
            e instanceof Error ? ` (${e.message})` : ''
          }`,
        )
        setUploading(false)
        return
      }
      setUploading(false)
    }

    setSubmitting(true)
    const { error } = await supabase.from('tanggo_mission_requests').insert({
      team_id: teamId,
      quiz_id: quiz.id,
      status: 'pending',
      media_url: mediaUrl,
      media_type: mediaType,
    })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    onSubmitted()
    onClose()
  }

  async function handleHint() {
    if (!hintAlreadySeen) {
      const ok = window.confirm(
        '힌트를 사용하시겠어요?\n한 번만 볼 수 있어요.',
      )
      if (!ok) return
      await supabase
        .from('tanggo_hint_requests')
        .upsert(
          { team_id: teamId, quiz_id: quiz.id },
          { onConflict: 'team_id,quiz_id', ignoreDuplicates: true },
        )
      onChanged()
    }
    setShowHint(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start md:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl border-4 border-orange-main my-8"
        style={{ boxShadow: 'var(--shadow-orange)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-text-dark/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-text-dark/50">
              <span aria-hidden className="mr-1">
                {missionSubtype
                  ? MISSION_SUBTYPE_EMOJI[missionSubtype]
                  : QUIZ_TYPE_EMOJI[quiz.type]}
              </span>
              {missionSubtype
                ? `${MISSION_SUBTYPE_LABEL[missionSubtype]} 미션`
                : QUIZ_TYPE_LABEL[quiz.type]}
            </p>
            <h2 className="text-lg font-black text-text-dark">
              미션 <span className="text-orange-main tabular-nums">#{quiz.order_num}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-dark/50 hover:bg-cream hover:text-text-dark text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {quiz.location_hint && (
            <p className="text-xs font-bold text-text-dark/60 mb-3">
              📍 {quiz.location_hint}
            </p>
          )}
          <p className="text-base font-semibold text-text-dark whitespace-pre-wrap">
            {quiz.question}
          </p>

          {/* 풀이 영역 */}
          {locked ? (
            <div className="mt-5 p-4 rounded-2xl bg-text-dark/5 text-center">
              <p className="text-base font-black text-text-dark/60">
                🔒 제출 완료
              </p>
              {answer?.submitted && answer.submitted !== '[현장미션승인]' && (
                <p className="mt-1 text-xs text-text-dark/60">
                  제출한 답: {answer.submitted}
                </p>
              )}
              <p className="mt-1 text-xs text-text-dark/50">
                결과는 게임이 끝난 뒤 결과 화면에서 확인할 수 있어요
              </p>
            </div>
          ) : missionPending ? (
            <div className="mt-5 p-4 rounded-2xl bg-[#F4C430]/15 text-center">
              <p className="text-base font-black text-[#A88300]">
                🕐 운영자 승인 대기 중...
              </p>
              <p className="mt-1 text-xs text-text-dark/70">
                현장 운영자가 확인하면 자동으로 완료됩니다
              </p>
            </div>
          ) : (
            <>
              {quiz.type === 'text' && (
                <div className="mt-5">
                  <label className="text-xs font-bold text-text-dark">
                    {votingEnabled ? '내가 생각한 답' : '정답 입력'}
                  </label>
                  <input
                    type="text"
                    value={textValue}
                    onChange={(e) => {
                      setTextTouched(true)
                      setTextAnswer(e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      if (votingEnabled) castVote(textValue)
                      else handleTextSubmit()
                    }}
                    placeholder="정답을 입력하세요"
                    autoComplete="off"
                    className="mt-1.5 w-full px-4 py-3 rounded-2xl border-2 border-text-dark/10 bg-white text-base font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
                  />
                  {votingEnabled && (
                    <button
                      type="button"
                      onClick={() => castVote(textValue)}
                      disabled={
                        voting ||
                        !textValue.trim() ||
                        textValue.trim() === myVote?.selected_answer
                      }
                      className={`mt-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                        voting ||
                        !textValue.trim() ||
                        textValue.trim() === myVote?.selected_answer
                          ? 'bg-text-dark/10 text-text-dark/40 cursor-not-allowed'
                          : 'border-2 border-orange-main text-orange-main hover:bg-orange-main/5'
                      }`}
                    >
                      {voting
                        ? '저장 중...'
                        : myVote
                          ? '✏️ 내 답 수정'
                          : '🙋 내 답 등록'}
                    </button>
                  )}
                </div>
              )}

              {quiz.type === 'choice' && quiz.choices && (
                <div className="mt-5 flex flex-col gap-2">
                  {quiz.choices.map((c, idx) => {
                    const selected = selectedIdx === idx
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={voting}
                        onClick={() => {
                          setChoiceIdx(idx)
                          if (votingEnabled) castVote(String(idx + 1))
                        }}
                        className={`flex items-center gap-3 px-3 py-3 rounded-2xl border-2 text-left transition-colors ${
                          selected
                            ? 'border-orange-main bg-orange-main/5'
                            : 'border-text-dark/10 hover:border-orange-main/40'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-full text-xs font-black tabular-nums ${
                            selected
                              ? 'bg-orange-main text-white'
                              : 'bg-text-dark/10 text-text-dark/60'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-text-dark">
                          {c}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {votingEnabled && (
                <VotePanel
                  quiz={quiz}
                  votes={votes}
                  memberNames={memberNames}
                  totalMembers={totalMembers}
                  memberName={memberName}
                  leaderName={leaderName}
                  isLeader={isLeader}
                  agreed={agreed}
                />
              )}

              {quiz.type === 'mission' && missionSubtype === 'verify' && (
                <div className="mt-5 p-4 rounded-2xl bg-cream">
                  <p className="text-sm text-text-dark/70 leading-relaxed">
                    ✋ 운영자에게 직접 보여주고 인증받으세요.
                    <br />
                    아래 버튼으로 완료 요청을 보낼 수 있어요.
                  </p>
                </div>
              )}

              {quiz.type === 'mission' && isUploadKind && (
                <div className="mt-5">
                  <p className="text-sm font-bold text-text-dark mb-2">
                    {missionSubtype === 'video'
                      ? '📹 영상을 찍어 올려주세요'
                      : '📷 사진을 찍어 올려주세요'}
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={missionSubtype === 'video' ? 'video/*' : 'image/*'}
                    capture="environment"
                    className="hidden"
                    onChange={onFilePicked}
                  />

                  {!mediaFile ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full py-4 rounded-2xl border-2 border-dashed border-orange-main/50 bg-orange-main/5 text-orange-main text-sm font-bold hover:bg-orange-main/10 active:scale-[0.99] transition-all"
                    >
                      {missionSubtype === 'video'
                        ? '📷 영상 찍기 / 갤러리에서 선택'
                        : '📷 사진 찍기 / 갤러리에서 선택'}
                    </button>
                  ) : (
                    <div className="rounded-2xl bg-cream p-3">
                      {missionSubtype === 'video' && mediaPreviewUrl && (
                        <video
                          src={mediaPreviewUrl}
                          controls
                          playsInline
                          className="w-full rounded-xl bg-black max-h-72 object-contain"
                        />
                      )}
                      {missionSubtype === 'photo' && mediaPreviewUrl && (
                        <img
                          src={mediaPreviewUrl}
                          alt="선택한 사진 미리보기"
                          className="w-full rounded-xl bg-black max-h-72 object-contain"
                        />
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text-dark truncate">
                            {mediaFile.name}
                          </p>
                          <p className="text-[11px] text-text-dark/60 tabular-nums">
                            {formatBytes(mediaFile.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearMedia}
                          disabled={uploading}
                          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 hover:bg-white text-text-dark/70 disabled:opacity-50"
                        >
                          다시 선택
                        </button>
                      </div>
                    </div>
                  )}

                  {uploading && (
                    <div className="mt-3 p-3 rounded-xl bg-orange-main/10">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border-2 border-orange-main border-t-transparent animate-spin" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-orange-main">
                            업로드 중...
                          </p>
                          <p className="text-[11px] text-text-dark/60">
                            잠시만 기다려주세요. 화면을 닫지 마세요.
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-orange-main/20 overflow-hidden">
                        <div className="h-full w-full bg-orange-main animate-pulse" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="mt-2 text-xs font-semibold text-[#E94B3C]">
                  {error}
                </p>
              )}

              {showHint && quiz.hint && (
                <div className="mt-4 p-3 rounded-xl bg-yellow-accent/15">
                  <p className="text-xs font-bold text-[#A88300] mb-1">💡 힌트</p>
                  <p className="text-sm text-text-dark/80 whitespace-pre-wrap">
                    {quiz.hint}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {!locked && !missionPending && (
          <div className="px-6 py-4 border-t border-text-dark/10 flex items-center justify-end gap-2">
            {quiz.hint && !showHint && (
              <button
                type="button"
                onClick={handleHint}
                className="px-4 py-2.5 rounded-xl border-2 border-yellow-accent text-[#A88300] text-sm font-bold hover:bg-yellow-accent/10"
              >
                💡 힌트 보기
              </button>
            )}
            {!isMission &&
              (votingEnabled ? (
                <button
                  type="button"
                  onClick={
                    quiz.type === 'text' ? handleTextSubmit : handleChoiceSubmit
                  }
                  disabled={!agreed || !isLeader || submitting}
                  title={
                    !isLeader
                      ? `방장(${leaderName ?? '미지정'})만 제출할 수 있어요`
                      : undefined
                  }
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    !agreed || !isLeader || submitting
                      ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                      : 'bg-orange-main text-white hover:bg-orange-sub'
                  }`}
                >
                  {submitting
                    ? '제출 중...'
                    : !isLeader
                      ? '👑 방장만 제출 가능'
                      : agreed
                        ? '✅ 팀 답안 제출'
                        : '전원 동의 필요'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={
                    quiz.type === 'text' ? handleTextSubmit : handleChoiceSubmit
                  }
                  disabled={
                    (quiz.type === 'text'
                      ? !textValue.trim()
                      : selectedIdx === null) || submitting
                  }
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    (quiz.type === 'text'
                      ? !textValue.trim()
                      : selectedIdx === null) || submitting
                      ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                      : 'bg-orange-main text-white hover:bg-orange-sub'
                  }`}
                >
                  {submitting ? '제출 중...' : '제출'}
                </button>
              ))}
            {quiz.type === 'mission' && (
              <button
                type="button"
                onClick={handleMissionRequest}
                disabled={
                  submitting ||
                  uploading ||
                  (isUploadKind && !mediaFile)
                }
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  submitting ||
                  uploading ||
                  (isUploadKind && !mediaFile)
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub'
                }`}
              >
                {uploading
                  ? '업로드 중...'
                  : submitting
                    ? '요청 중...'
                    : isUploadKind
                      ? '📡 업로드 후 제출'
                      : '📡 완료 요청 보내기'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 팀원별 답 선택 현황 + 전원 동의 여부 패널 */
function VotePanel({
  quiz,
  votes,
  memberNames,
  totalMembers,
  memberName,
  leaderName,
  isLeader,
  agreed,
}: {
  quiz: Quiz
  votes: MemberVoteRow[]
  memberNames: string[]
  totalMembers: number
  memberName: string | null
  leaderName: string | null
  isLeader: boolean
  agreed: boolean
}) {
  const voteByName = new Map(votes.map((v) => [v.member_name, v]))
  // 팀원 명단이 있으면 그 순서대로, 없으면 투표한 사람만 표시
  const rows =
    memberNames.length > 0
      ? memberNames
      : votes.map((v) => v.member_name).sort()

  function labelOf(value: string): string {
    if (quiz.type === 'choice') {
      const idx = Number(value) - 1
      const text = quiz.choices?.[idx]
      return text ? `${idx + 1}. ${text}` : `보기 ${value}`
    }
    return value
  }

  return (
    <div className="mt-5 rounded-2xl border-2 border-text-dark/10 bg-cream/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-text-dark/70">🙋 팀원 선택 현황</p>
        <p className="text-xs font-bold text-text-dark/60 tabular-nums">
          <span className="text-orange-main">{votes.length}</span> / {totalMembers}명
        </p>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {rows.map((name) => {
          const vote = voteByName.get(name)
          const isMe = name === memberName
          return (
            <li
              key={name}
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl ${
                vote ? 'bg-white' : 'bg-white/50'
              }`}
            >
              <span className="min-w-0 flex items-center gap-1">
                {name === leaderName && (
                  <span aria-label="방장" title="방장">
                    👑
                  </span>
                )}
                <span
                  className={`text-xs font-bold truncate ${
                    isMe ? 'text-orange-main' : 'text-text-dark/80'
                  }`}
                >
                  {name}
                  {isMe && ' (나)'}
                </span>
              </span>
              <span
                className={`shrink-0 text-[11px] font-bold max-w-[55%] truncate ${
                  vote ? 'text-text-dark' : 'text-text-dark/35'
                }`}
              >
                {vote ? labelOf(vote.selected_answer) : '선택 대기…'}
              </span>
            </li>
          )
        })}
      </ul>

      {agreed ? (
        <div className="mt-2.5 px-3 py-2 rounded-xl bg-mint-light">
          <p className="text-xs font-black text-[#2C7846]">
            ✅ 전원 동의 완료!
          </p>
          <p className="mt-0.5 text-[11px] text-text-dark/70">
            {isLeader
              ? '아래 [팀 답안 제출]을 눌러 제출하세요'
              : `방장(${leaderName ?? '미지정'})이 제출할 수 있어요`}
          </p>
        </div>
      ) : votes.length < totalMembers ? (
        <div className="mt-2.5 px-3 py-2 rounded-xl bg-[#F4C430]/20">
          <p className="text-xs font-black text-[#A88300]">
            🕐 아직 모두 선택하지 않았어요
          </p>
          <p className="mt-0.5 text-[11px] text-text-dark/70">
            팀원 전원이 같은 답을 골라야 제출할 수 있어요
          </p>
        </div>
      ) : (
        <div className="mt-2.5 px-3 py-2 rounded-xl bg-[#E94B3C]/10">
          <p className="text-xs font-black text-[#E94B3C]">
            🤔 의견이 갈렸어요
          </p>
          <p className="mt-0.5 text-[11px] text-text-dark/70">
            팀원과 이야기한 뒤 답을 다시 골라주세요
          </p>
        </div>
      )}
    </div>
  )
}
