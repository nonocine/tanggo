import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type {
  MissionSubtype,
  Quiz,
  QuizInput,
  QuizType,
} from '../../../lib/quizTypes'
import {
  MISSION_SUBTYPE_EMOJI,
  MISSION_SUBTYPE_LABEL,
  QUIZ_TYPE_EMOJI,
  QUIZ_TYPE_LABEL,
} from '../../../lib/quizTypes'

interface Props {
  mode: 'create' | 'edit'
  quiz?: Quiz
  nextOrderNum: number
  onClose: () => void
  onSaved: () => void
}

const TYPES: QuizType[] = ['text', 'choice', 'mission']
const MISSION_SUBTYPES: MissionSubtype[] = [
  'video',
  'photo',
  'verify',
  'photo_with_text',
]

interface FormState {
  order_num: number
  type: QuizType
  missionSubtype: MissionSubtype
  question: string
  location_hint: string
  choices: [string, string, string, string]
  textAnswer: string
  choiceAnswerIdx: number | null
  answerVariants: string[]
  variantDraft: string
  hint: string
}

function makeInitial(props: Props): FormState {
  if (props.mode === 'edit' && props.quiz) {
    const q = props.quiz
    const cs = q.choices ?? ['', '', '', '']
    const padded: [string, string, string, string] = [
      cs[0] ?? '',
      cs[1] ?? '',
      cs[2] ?? '',
      cs[3] ?? '',
    ]
    const choiceIdx =
      q.type === 'choice' && q.answer ? Number(q.answer) - 1 : null
    return {
      order_num: q.order_num,
      type: q.type,
      missionSubtype: q.mission_subtype ?? 'verify',
      question: q.question,
      location_hint: q.location_hint ?? '',
      choices: padded,
      textAnswer: q.type === 'text' ? q.answer ?? '' : '',
      choiceAnswerIdx: choiceIdx !== null && choiceIdx >= 0 ? choiceIdx : null,
      answerVariants: q.answer_variants ?? [],
      variantDraft: '',
      hint: q.hint ?? '',
    }
  }
  return {
    order_num: props.nextOrderNum,
    type: 'text',
    missionSubtype: 'verify',
    question: '',
    location_hint: '',
    choices: ['', '', '', ''],
    textAnswer: '',
    choiceAnswerIdx: null,
    answerVariants: [],
    variantDraft: '',
    hint: '',
  }
}

export default function QuizFormModal(props: Props) {
  const { mode, quiz, onClose, onSaved } = props
  const [form, setForm] = useState<FormState>(() => makeInitial(props))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setChoice(idx: number, value: string) {
    setForm((prev) => {
      const next = [...prev.choices] as [string, string, string, string]
      next[idx] = value
      return { ...prev, choices: next }
    })
  }

  function addVariant() {
    const v = form.variantDraft.trim()
    if (!v) return
    setForm((prev) => ({
      ...prev,
      answerVariants: Array.from(new Set([...prev.answerVariants, v])),
      variantDraft: '',
    }))
  }

  function removeVariant(v: string) {
    setForm((prev) => ({
      ...prev,
      answerVariants: prev.answerVariants.filter((x) => x !== v),
    }))
  }

  const validation = useMemo<string | null>(() => {
    if (!Number.isFinite(form.order_num) || form.order_num < 1) {
      return '번호는 1 이상이어야 해요'
    }
    if (!form.question.trim()) return '문제를 입력해 주세요'
    if (form.type === 'text' && !form.textAnswer.trim()) {
      return '주관식은 정답을 입력해 주세요'
    }
    if (form.type === 'choice') {
      if (form.choices.some((c) => !c.trim())) {
        return '객관식 보기 4개를 모두 입력해 주세요'
      }
      if (form.choiceAnswerIdx === null) {
        return '객관식 정답을 선택해 주세요'
      }
    }
    return null
  }, [form])

  async function handleSubmit() {
    if (validation || submitting) return
    setSubmitting(true)
    setError(null)

    const payload: QuizInput = {
      order_num: form.order_num,
      type: form.type,
      mission_subtype: form.type === 'mission' ? form.missionSubtype : null,
      question: form.question.trim(),
      location_hint: form.location_hint.trim() || null,
      choices: form.type === 'choice' ? form.choices.map((c) => c.trim()) : null,
      answer:
        form.type === 'text'
          ? form.textAnswer.trim()
          : form.type === 'choice' && form.choiceAnswerIdx !== null
            ? String(form.choiceAnswerIdx + 1)
            : null,
      answer_variants:
        form.type === 'text' && form.answerVariants.length > 0
          ? form.answerVariants
          : null,
      hint: form.hint.trim() || null,
      is_active: quiz?.is_active ?? true,
    }

    let dbError: { message: string } | null = null
    if (mode === 'edit' && quiz) {
      const { error } = await supabase
        .from('tanggo_quizzes')
        .update(payload)
        .eq('id', quiz.id)
      dbError = error
    } else {
      const { error } = await supabase.from('tanggo_quizzes').insert(payload)
      dbError = error
    }

    if (dbError) {
      setError(dbError.message)
      setSubmitting(false)
      return
    }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl border-4 border-orange-main my-8"
        style={{ boxShadow: 'var(--shadow-orange)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-2 border-b border-text-dark/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-dark">
            {mode === 'create' ? '✨ 새 미션 추가' : '✏ 미션 수정'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-dark/50 hover:bg-cream hover:text-text-dark text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* 번호 + 유형 */}
          <div className="flex gap-3">
            <div className="w-24">
              <label className="text-xs font-bold text-text-dark">번호</label>
              <input
                type="number"
                min={1}
                value={form.order_num}
                onChange={(e) => set('order_num', Number(e.target.value))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-text-dark">유형</label>
              <div className="mt-1 flex gap-2">
                {TYPES.map((t) => {
                  const active = form.type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('type', t)}
                      className={`flex-1 px-2 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                        active
                          ? 'border-orange-main bg-orange-main/10 text-orange-main'
                          : 'border-text-dark/10 text-text-dark/60 hover:border-orange-main/40'
                      }`}
                    >
                      <span aria-hidden className="mr-1">
                        {QUIZ_TYPE_EMOJI[t]}
                      </span>
                      {QUIZ_TYPE_LABEL[t]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 세부 유형 (현장 미션일 때만) */}
          {form.type === 'mission' && (
            <div>
              <label className="text-xs font-bold text-text-dark">
                현장 미션 세부 유형
              </label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {MISSION_SUBTYPES.map((st) => {
                  const active = form.missionSubtype === st
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => set('missionSubtype', st)}
                      className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                        active
                          ? 'border-orange-main bg-orange-main/10 text-orange-main'
                          : 'border-text-dark/10 text-text-dark/60 hover:border-orange-main/40'
                      }`}
                    >
                      <span aria-hidden className="mr-1">
                        {MISSION_SUBTYPE_EMOJI[st]}
                      </span>
                      {MISSION_SUBTYPE_LABEL[st]}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-text-dark/50">
                {form.missionSubtype === 'video' &&
                  '📹 참가자가 영상을 찍어 업로드해요'}
                {form.missionSubtype === 'photo' &&
                  '📷 참가자가 사진을 찍어 업로드해요'}
                {form.missionSubtype === 'verify' &&
                  '✋ 운영자가 현장에서 직접 확인해요 (업로드 없음)'}
              </p>
            </div>
          )}

          {/* 문제 */}
          <div>
            <label className="text-xs font-bold text-text-dark">문제 본문</label>
            <textarea
              value={form.question}
              onChange={(e) => set('question', e.target.value)}
              rows={3}
              placeholder="문제를 입력하세요"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
            />
          </div>

          {/* 위치 힌트 */}
          <div>
            <label className="text-xs font-bold text-text-dark">
              위치 힌트 <span className="text-text-dark/40 font-medium">(선택)</span>
            </label>
            <input
              type="text"
              value={form.location_hint}
              onChange={(e) => set('location_hint', e.target.value)}
              placeholder="예: 3F 복도 INFORMATION 게시판"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
            />
          </div>

          {/* 유형별 추가 필드 */}
          {form.type === 'text' && (
            <>
              <div>
                <label className="text-xs font-bold text-text-dark">정답</label>
                <input
                  type="text"
                  value={form.textAnswer}
                  onChange={(e) => set('textAnswer', e.target.value)}
                  placeholder="정답 텍스트"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-dark">
                  정답 변형{' '}
                  <span className="text-text-dark/40 font-medium">(선택)</span>
                </label>
                <p className="mt-0.5 text-[11px] text-text-dark/50">
                  정답으로 인정할 다른 표현을 추가하세요 (예: HAMA, 하마.)
                </p>
                {form.answerVariants.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.answerVariants.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-main/10 text-orange-main text-xs font-semibold"
                      >
                        {v}
                        <button
                          type="button"
                          onClick={() => removeVariant(v)}
                          aria-label={`${v} 삭제`}
                          className="text-orange-main/70 hover:text-orange-main"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={form.variantDraft}
                    onChange={(e) => set('variantDraft', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addVariant()
                      }
                    }}
                    placeholder="추가할 표현 입력 후 Enter"
                    className="flex-1 px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
                  />
                  <button
                    type="button"
                    onClick={addVariant}
                    className="px-4 rounded-xl bg-orange-main/10 text-orange-main text-sm font-bold hover:bg-orange-main/20"
                  >
                    추가
                  </button>
                </div>
              </div>
            </>
          )}

          {form.type === 'choice' && (
            <div>
              <label className="text-xs font-bold text-text-dark">
                보기 4개 + 정답 선택
              </label>
              <div className="mt-1.5 flex flex-col gap-2">
                {form.choices.map((c, idx) => {
                  const isAnswer = form.choiceAnswerIdx === idx
                  return (
                    <label
                      key={idx}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border-2 transition-colors ${
                        isAnswer
                          ? 'border-[#4CAF7F] bg-[#4CAF7F]/5'
                          : 'border-text-dark/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="choiceAnswer"
                        checked={isAnswer}
                        onChange={() => set('choiceAnswerIdx', idx)}
                        className="accent-[#4CAF7F]"
                        aria-label={`정답: 보기 ${idx + 1}`}
                      />
                      <span className="w-6 text-xs font-bold text-text-dark/60 tabular-nums">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={c}
                        onChange={(e) => setChoice(idx, e.target.value)}
                        placeholder={`보기 ${idx + 1}`}
                        className="flex-1 px-2 py-1.5 rounded-lg border border-text-dark/10 text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main"
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* 힌트 */}
          <div>
            <label className="text-xs font-bold text-text-dark">
              힌트 <span className="text-text-dark/40 font-medium">(선택)</span>
            </label>
            <textarea
              value={form.hint}
              onChange={(e) => set('hint', e.target.value)}
              rows={2}
              placeholder="팀이 힌트 요청 시 보여줄 텍스트"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
            />
          </div>

          {(validation || error) && (
            <p className="text-xs font-semibold text-[#E94B3C]">
              {error ?? validation}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-text-dark/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-dark/70 hover:bg-cream"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!!validation || submitting}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              validation || submitting
                ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                : 'bg-orange-main text-white hover:bg-orange-sub'
            }`}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
