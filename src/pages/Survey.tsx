import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import { useText } from '../lib/useTextContent'
import type {
  SurveyQuestion,
  SurveyResponse,
  SurveyResponseInput,
} from '../lib/surveyTypes'

type AnswerState =
  | { kind: 'rating'; value: number | null }
  | { kind: 'text'; value: string }
  | { kind: 'single'; value: string | null }
  | { kind: 'multi'; values: Set<string> }

function makeEmpty(q: SurveyQuestion): AnswerState {
  switch (q.question_type) {
    case 'rating':
      return { kind: 'rating', value: null }
    case 'short_text':
    case 'long_text':
      return { kind: 'text', value: '' }
    case 'single_choice':
      return { kind: 'single', value: null }
    case 'multi_choice':
      return { kind: 'multi', values: new Set() }
  }
}

function hydrateFromExisting(
  q: SurveyQuestion,
  r: SurveyResponse | undefined,
): AnswerState {
  if (!r) return makeEmpty(q)
  switch (q.question_type) {
    case 'rating':
      return { kind: 'rating', value: r.answer_number }
    case 'short_text':
    case 'long_text':
      return { kind: 'text', value: r.answer_text ?? '' }
    case 'single_choice':
      return { kind: 'single', value: r.answer_choices?.[0] ?? null }
    case 'multi_choice':
      return { kind: 'multi', values: new Set(r.answer_choices ?? []) }
  }
}

function isAnswered(state: AnswerState): boolean {
  switch (state.kind) {
    case 'rating':
      return state.value !== null
    case 'text':
      return state.value.trim().length > 0
    case 'single':
      return state.value !== null
    case 'multi':
      return state.values.size > 0
  }
}

function buildPayload(
  q: SurveyQuestion,
  state: AnswerState,
  teamId: string,
  respondentName: string | null,
): SurveyResponseInput | null {
  if (!isAnswered(state)) return null
  const base = {
    team_id: teamId,
    question_id: q.id,
    respondent_name: respondentName,
    answer_text: null as string | null,
    answer_number: null as number | null,
    answer_choices: null as string[] | null,
  }
  switch (state.kind) {
    case 'rating':
      return { ...base, answer_number: state.value }
    case 'text':
      return { ...base, answer_text: state.value.trim() }
    case 'single':
      return {
        ...base,
        answer_text: state.value,
        answer_choices: state.value ? [state.value] : null,
      }
    case 'multi':
      return { ...base, answer_choices: Array.from(state.values) }
  }
}

export default function Survey() {
  const navigate = useNavigate()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)
  const memberName = useTeamStore((s) => s.memberName)

  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [answers, setAnswers] = useState<Map<string, AnswerState>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const respondentName = memberName?.trim() || null

  const thanksTitle = useText('survey_thanks_title', '참여해주셔서 감사합니다!')
  const thanksBody = useText(
    'survey_thanks_body',
    '여러분의 의견이 다음 행사를 더 재밌게 만들어요.',
  )

  const fetchAll = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    const [qRes, rRes] = await Promise.all([
      supabase
        .from('tanggo_survey_questions')
        .select('*')
        .eq('is_active', true)
        .order('order_num', { ascending: true }),
      respondentName
        ? supabase
            .from('tanggo_survey_responses')
            .select('*')
            .eq('team_id', teamId)
            .eq('respondent_name', respondentName)
        : supabase
            .from('tanggo_survey_responses')
            .select('*')
            .eq('team_id', teamId)
            .is('respondent_name', null),
    ])
    if (qRes.error || rRes.error) {
      setError(qRes.error?.message ?? rRes.error?.message ?? '로딩 실패')
      setLoading(false)
      return
    }
    const qs = (qRes.data ?? []) as SurveyQuestion[]
    const rs = (rRes.data ?? []) as SurveyResponse[]
    const rByQ = new Map<string, SurveyResponse>()
    for (const r of rs) rByQ.set(r.question_id, r)

    const next = new Map<string, AnswerState>()
    for (const q of qs) next.set(q.id, hydrateFromExisting(q, rByQ.get(q.id)))

    setQuestions(qs)
    setAnswers(next)
    setError(null)
    setLoading(false)
  }, [teamId, respondentName])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  function updateAnswer(qid: string, next: AnswerState) {
    setAnswers((prev) => {
      const m = new Map(prev)
      m.set(qid, next)
      return m
    })
  }

  const { answeredCount, missingRequired } = useMemo(() => {
    let answered = 0
    const missing: SurveyQuestion[] = []
    for (const q of questions) {
      const a = answers.get(q.id)
      if (a && isAnswered(a)) answered++
      else if (q.is_required) missing.push(q)
    }
    return { answeredCount: answered, missingRequired: missing }
  }, [questions, answers])

  async function handleSubmit() {
    if (!teamId || submitting) return
    if (missingRequired.length > 0) return
    setSubmitting(true)
    setSubmitError(null)

    // 답한 항목만 upsert
    const payloads: SurveyResponseInput[] = []
    for (const q of questions) {
      const a = answers.get(q.id)
      if (!a) continue
      const p = buildPayload(q, a, teamId, respondentName)
      if (p) payloads.push(p)
    }

    if (payloads.length === 0) {
      setSubmitError('한 개 이상 답해주세요')
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('tanggo_survey_responses')
      .upsert(payloads, {
        onConflict: 'team_id,question_id,respondent_name',
      })

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setSubmitted(true)
  }

  if (!teamId) return null

  if (submitted) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6 text-center">
        <div className="text-7xl mb-4" aria-hidden>
          🎉
        </div>
        <h1 className="text-2xl font-black text-orange-main whitespace-pre-line">
          {thanksTitle}
        </h1>
        <p className="mt-2 text-sm text-text-dark/70 whitespace-pre-line">
          {thanksBody}
        </p>
        <div className="mt-8 flex flex-col gap-2 w-full max-w-xs">
          <button
            type="button"
            onClick={() => navigate('/result')}
            className="px-6 py-3 rounded-2xl bg-orange-main text-white text-base font-bold hover:bg-orange-sub active:scale-[0.98] transition-all"
            style={{ boxShadow: 'var(--shadow-orange-sm)' }}
          >
            결과 화면으로
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-2xl border-2 border-text-dark/15 text-text-dark/70 text-base font-bold hover:bg-white"
          >
            🏠 홈으로
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="sticky top-0 z-20 bg-white border-b border-text-dark/10 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-text-dark">
            📝 만족도 조사
            <span className="text-text-dark/40 mx-1.5">·</span>
            <span className="text-orange-main">{teamName ?? ''}</span>
            {memberName && (
              <span className="text-text-dark/60"> ({memberName})</span>
            )}
          </p>
          <p className="text-xs font-bold text-text-dark/70 tabular-nums">
            <span className="text-orange-main">{answeredCount}</span>
            <span className="text-text-dark/40"> / {questions.length}</span>{' '}
            답변 완료
          </p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-text-dark/10 overflow-hidden">
          <div
            className="h-full bg-orange-main transition-all"
            style={{
              width:
                questions.length === 0
                  ? '0%'
                  : `${(answeredCount / questions.length) * 100}%`,
            }}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-5">
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
        ) : questions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/60">
              아직 등록된 설문 질문이 없어요
            </p>
            <button
              type="button"
              onClick={() => navigate('/result')}
              className="mt-4 px-4 py-2 rounded-xl border-2 border-text-dark/15 text-sm font-bold text-text-dark/70 hover:bg-white"
            >
              결과 화면으로
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {questions.map((q, idx) => (
                <QuestionCard
                  key={q.id}
                  index={idx + 1}
                  question={q}
                  answer={answers.get(q.id) ?? makeEmpty(q)}
                  onChange={(next) => updateAnswer(q.id, next)}
                />
              ))}
            </div>

            <div className="mt-6">
              {missingRequired.length > 0 && (
                <p className="mb-2 text-xs font-semibold text-[#E94B3C] text-center">
                  필수 질문 {missingRequired.length}개를 답해주세요
                </p>
              )}
              {submitError && (
                <p className="mb-2 text-xs font-semibold text-[#E94B3C] text-center">
                  {submitError}
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || missingRequired.length > 0}
                className={`w-full py-4 rounded-2xl text-base font-black transition-all ${
                  submitting || missingRequired.length > 0
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.98]'
                }`}
                style={
                  !(submitting || missingRequired.length > 0)
                    ? { boxShadow: 'var(--shadow-orange-sm)' }
                    : undefined
                }
              >
                {submitting ? '제출 중...' : '✅ 제출하기'}
              </button>
              <p className="mt-3 text-[11px] text-text-dark/40 text-center">
                같은 사람이 다시 제출하면 기존 응답이 갱신돼요
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function QuestionCard({
  index,
  question,
  answer,
  onChange,
}: {
  index: number
  question: SurveyQuestion
  answer: AnswerState
  onChange: (next: AnswerState) => void
}) {
  return (
    <section className="rounded-2xl border-2 border-text-dark/10 bg-white p-4">
      <div className="flex items-start gap-2">
        <span className="text-sm font-black text-orange-main tabular-nums shrink-0">
          Q{index}.
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-text-dark whitespace-pre-wrap">
            {question.question}
            {question.is_required && (
              <span className="ml-1 text-[#E94B3C]" aria-label="필수">
                *
              </span>
            )}
          </p>
          {question.description && (
            <p className="mt-1 text-xs text-text-dark/60">
              {question.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        {question.question_type === 'rating' && answer.kind === 'rating' && (
          <RatingInput
            value={answer.value}
            onChange={(v) => onChange({ kind: 'rating', value: v })}
          />
        )}

        {question.question_type === 'short_text' && answer.kind === 'text' && (
          <input
            type="text"
            value={answer.value}
            onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
            placeholder="답변을 입력하세요"
            className="w-full px-3 py-3 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
          />
        )}

        {question.question_type === 'long_text' && answer.kind === 'text' && (
          <textarea
            value={answer.value}
            onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
            rows={4}
            placeholder="자유롭게 적어주세요"
            className="w-full px-3 py-3 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
          />
        )}

        {question.question_type === 'single_choice' &&
          answer.kind === 'single' && (
            <div className="flex flex-col gap-2">
              {(question.choices ?? []).map((c) => {
                const selected = answer.value === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange({ kind: 'single', value: c })}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-colors ${
                      selected
                        ? 'border-orange-main bg-orange-main/5'
                        : 'border-text-dark/10 hover:border-orange-main/40'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 shrink-0 rounded-full border-2 ${
                        selected
                          ? 'border-orange-main bg-orange-main'
                          : 'border-text-dark/30 bg-white'
                      } flex items-center justify-center`}
                    >
                      {selected && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="text-sm font-semibold text-text-dark">
                      {c}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

        {question.question_type === 'multi_choice' &&
          answer.kind === 'multi' && (
            <div className="flex flex-col gap-2">
              {(question.choices ?? []).map((c) => {
                const selected = answer.values.has(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      const next = new Set(answer.values)
                      if (selected) next.delete(c)
                      else next.add(c)
                      onChange({ kind: 'multi', values: next })
                    }}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-colors ${
                      selected
                        ? 'border-orange-main bg-orange-main/5'
                        : 'border-text-dark/10 hover:border-orange-main/40'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 shrink-0 rounded border-2 ${
                        selected
                          ? 'border-orange-main bg-orange-main'
                          : 'border-text-dark/30 bg-white'
                      } flex items-center justify-center text-white text-xs font-black`}
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="text-sm font-semibold text-text-dark">
                      {c}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
      </div>
    </section>
  )
}

function RatingInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="flex justify-center gap-2 py-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value !== null && n <= value
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n}점`}
            className={`w-12 h-12 rounded-2xl text-3xl transition-all active:scale-95 ${
              active
                ? 'bg-yellow-accent/30'
                : 'bg-text-dark/5 hover:bg-yellow-accent/20'
            }`}
          >
            <span style={{ filter: active ? 'none' : 'grayscale(1) opacity(0.4)' }}>
              ⭐
            </span>
          </button>
        )
      })}
    </div>
  )
}
