import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'
import type { Quiz } from '../lib/quizTypes'
import { QUIZ_TYPE_EMOJI, QUIZ_TYPE_LABEL } from '../lib/quizTypes'

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
}

interface TeamRow {
  id: string
  team_name: string
  started_at: string | null
  finished_at: string | null
}

interface EventConfigRow {
  service_ended: boolean
}

type CardStatus = 'done' | 'awaiting' | 'rejected' | 'todo'

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
  if (answer?.is_correct) return 'done'
  if (quiz.type === 'mission') {
    if (req?.status === 'pending') return 'awaiting'
    if (req?.status === 'rejected') return 'rejected'
  }
  return 'todo'
}

function StatusBadge({ status }: { status: CardStatus }) {
  if (status === 'done')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-mint/25 text-[#2C7846]">
        ✅ 정답
      </span>
    )
  if (status === 'awaiting')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F4C430]/20 text-[#A88300]">
        🕐 승인 대기
      </span>
    )
  if (status === 'rejected')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E94B3C]/15 text-[#E94B3C]">
        ❌ 거절됨
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
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)

  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [answersMap, setAnswersMap] = useState<Map<string, AnswerRow>>(new Map())
  const [requestsMap, setRequestsMap] = useState<Map<string, MissionRequestRow>>(
    new Map(),
  )
  const [hintSeen, setHintSeen] = useState<Set<string>>(new Set())
  const [team, setTeam] = useState<TeamRow | null>(null)
  const [config, setConfig] = useState<EventConfigRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openQuiz, setOpenQuiz] = useState<Quiz | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const finishingRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!teamId) return
    const [quizzesRes, answersRes, requestsRes, hintsRes, teamRes, configRes] =
      await Promise.all([
        supabase
          .from('tanggo_quizzes')
          .select('*')
          .eq('is_active', true)
          .order('order_num', { ascending: true }),
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
          .select('id, team_name, started_at, finished_at')
          .eq('id', teamId)
          .maybeSingle(),
        supabase
          .from('tanggo_event_config')
          .select('service_ended')
          .eq('id', 1)
          .maybeSingle(),
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

    setLoading(false)
  }, [teamId])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  const correctCount = useMemo(() => {
    let c = 0
    for (const q of quizzes) {
      if (answersMap.get(q.id)?.is_correct) c++
    }
    return c
  }, [quizzes, answersMap])

  const total = quizzes.length
  const progressPct = total === 0 ? 0 : Math.round((correctCount / total) * 100)

  // 자동 완료 트리거
  useEffect(() => {
    if (finishingRef.current) return
    if (!team || team.finished_at) return
    if (total === 0) return
    if (correctCount < total) return
    finishingRef.current = true
    setCelebrate(true)
    supabase
      .from('tanggo_teams')
      .update({ finished_at: new Date().toISOString() })
      .eq('id', team.id)
      .then(() => {
        setTimeout(() => navigate('/result', { replace: true }), 3000)
      })
  }, [correctCount, total, team, navigate])

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
            <span className="text-orange-main">{correctCount}</span>
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
              const borderCls =
                status === 'done'
                  ? 'border-mint'
                  : status === 'awaiting'
                    ? 'border-[#F4C430]'
                    : status === 'rejected'
                      ? 'border-[#E94B3C]'
                      : 'border-text-dark/10'
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setOpenQuiz(q)}
                  className={`text-left rounded-2xl border-2 bg-white p-3 hover:-translate-y-0.5 active:translate-y-0 transition-all ${borderCls}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-black text-orange-main tabular-nums">
                      #{q.order_num}
                    </span>
                    <span className="text-base" aria-hidden>
                      {QUIZ_TYPE_EMOJI[q.type]}
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

        <div className="mt-8 flex justify-center">
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
          onClose={() => setOpenQuiz(null)}
          onChanged={() => {
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
            <p className="mt-2 text-sm text-text-dark/70">
              잠시 후 결과 화면으로 이동합니다...
            </p>
          </div>
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
  onClose,
  onChanged,
}: {
  quiz: Quiz
  teamId: string
  answer: AnswerRow | undefined
  missionRequest: MissionRequestRow | undefined
  hintAlreadySeen: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [textAnswer, setTextAnswer] = useState('')
  const [choiceIdx, setChoiceIdx] = useState<number | null>(null)
  const [wrongMsg, setWrongMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showHint, setShowHint] = useState(hintAlreadySeen)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const solved = !!answer?.is_correct
  const isAwaiting = quiz.type === 'mission' && missionRequest?.status === 'pending'
  const isRejected = quiz.type === 'mission' && missionRequest?.status === 'rejected'

  async function handleTextSubmit() {
    if (submitting || solved) return
    if (!textAnswer.trim()) return
    setSubmitting(true)
    setWrongMsg(null)
    setError(null)
    if (checkAnswer(quiz, textAnswer)) {
      const { error } = await supabase.from('tanggo_answers').upsert(
        {
          team_id: teamId,
          quiz_id: quiz.id,
          submitted: textAnswer.trim(),
          is_correct: true,
          answered_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,quiz_id' },
      )
      if (error) {
        setError(error.message)
        setSubmitting(false)
        return
      }
      onChanged()
      onClose()
    } else {
      setWrongMsg('다시 시도해보세요! 🤔')
      setSubmitting(false)
    }
  }

  async function handleChoiceSubmit() {
    if (submitting || solved || choiceIdx === null) return
    setSubmitting(true)
    setWrongMsg(null)
    setError(null)
    const submitted = String(choiceIdx + 1)
    if (checkAnswer(quiz, submitted)) {
      const { error } = await supabase.from('tanggo_answers').upsert(
        {
          team_id: teamId,
          quiz_id: quiz.id,
          submitted,
          is_correct: true,
          answered_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,quiz_id' },
      )
      if (error) {
        setError(error.message)
        setSubmitting(false)
        return
      }
      onChanged()
      onClose()
    } else {
      setWrongMsg('다시 시도해보세요! 🤔')
      setSubmitting(false)
    }
  }

  async function handleMissionRequest() {
    if (submitting || solved || isAwaiting) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('tanggo_mission_requests').insert({
      team_id: teamId,
      quiz_id: quiz.id,
      status: 'pending',
    })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    onChanged()
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
                {QUIZ_TYPE_EMOJI[quiz.type]}
              </span>
              {QUIZ_TYPE_LABEL[quiz.type]}
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
          {solved ? (
            <div className="mt-5 p-4 rounded-2xl bg-mint/15 text-center">
              <p className="text-base font-black text-[#2C7846]">✅ 정답입니다!</p>
              {answer?.submitted && answer.submitted !== '[현장미션승인]' && (
                <p className="mt-1 text-xs text-text-dark/70">
                  제출: {answer.submitted}
                </p>
              )}
            </div>
          ) : isAwaiting ? (
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
              {isRejected && (
                <div className="mt-4 p-3 rounded-xl bg-[#E94B3C]/10">
                  <p className="text-xs font-bold text-[#E94B3C]">
                    ❌ 직전 요청이 거절되었어요
                  </p>
                  {missionRequest?.note && (
                    <p className="mt-1 text-xs text-text-dark/70 italic">
                      "{missionRequest.note}"
                    </p>
                  )}
                  <p className="mt-1 text-xs text-text-dark/60">
                    다시 시도할 수 있어요.
                  </p>
                </div>
              )}

              {quiz.type === 'text' && (
                <div className="mt-5">
                  <label className="text-xs font-bold text-text-dark">
                    정답 입력
                  </label>
                  <input
                    type="text"
                    value={textAnswer}
                    onChange={(e) => {
                      setTextAnswer(e.target.value)
                      if (wrongMsg) setWrongMsg(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTextSubmit()
                    }}
                    placeholder="정답을 입력하세요"
                    autoComplete="off"
                    className="mt-1.5 w-full px-4 py-3 rounded-2xl border-2 border-text-dark/10 bg-white text-base font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
                  />
                </div>
              )}

              {quiz.type === 'choice' && quiz.choices && (
                <div className="mt-5 flex flex-col gap-2">
                  {quiz.choices.map((c, idx) => {
                    const selected = choiceIdx === idx
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setChoiceIdx(idx)
                          if (wrongMsg) setWrongMsg(null)
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

              {quiz.type === 'mission' && (
                <div className="mt-5 p-4 rounded-2xl bg-cream">
                  <p className="text-sm text-text-dark/70 leading-relaxed">
                    운영자에게 미션 수행 결과를 보여주고 승인을 받으세요.
                    <br />
                    아래 버튼으로 완료 요청을 보낼 수 있어요.
                  </p>
                </div>
              )}

              {wrongMsg && (
                <p className="mt-3 text-sm font-bold text-[#E94B3C] text-center animate-slide-in-down">
                  {wrongMsg}
                </p>
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

        {!solved && (
          <div className="px-6 py-4 border-t border-text-dark/10 flex items-center justify-end gap-2">
            {quiz.hint && !showHint && !isAwaiting && (
              <button
                type="button"
                onClick={handleHint}
                className="px-4 py-2.5 rounded-xl border-2 border-yellow-accent text-[#A88300] text-sm font-bold hover:bg-yellow-accent/10"
              >
                💡 힌트 보기
              </button>
            )}
            {quiz.type === 'text' && (
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={!textAnswer.trim() || submitting}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  !textAnswer.trim() || submitting
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub'
                }`}
              >
                {submitting ? '확인 중...' : '제출'}
              </button>
            )}
            {quiz.type === 'choice' && (
              <button
                type="button"
                onClick={handleChoiceSubmit}
                disabled={choiceIdx === null || submitting}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  choiceIdx === null || submitting
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub'
                }`}
              >
                {submitting ? '확인 중...' : '제출'}
              </button>
            )}
            {quiz.type === 'mission' && !isAwaiting && (
              <button
                type="button"
                onClick={handleMissionRequest}
                disabled={submitting}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  submitting
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub'
                }`}
              >
                {submitting ? '요청 중...' : '📡 완료 요청 보내기'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
