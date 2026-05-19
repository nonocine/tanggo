import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type {
  SurveyQuestion,
  SurveyQuestionInput,
  SurveyQuestionType,
} from '../../../lib/surveyTypes'
import {
  SURVEY_TYPE_EMOJI,
  SURVEY_TYPE_LABEL,
  hasChoices,
} from '../../../lib/surveyTypes'

interface Props {
  mode: 'create' | 'edit'
  question?: SurveyQuestion
  nextOrderNum: number
  onClose: () => void
  onSaved: () => void
}

const TYPES: SurveyQuestionType[] = [
  'rating',
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
]

interface FormState {
  order_num: number
  question_type: SurveyQuestionType
  question: string
  description: string
  is_required: boolean
  choices: string[]
}

function makeInitial(props: Props): FormState {
  if (props.mode === 'edit' && props.question) {
    const q = props.question
    return {
      order_num: q.order_num,
      question_type: q.question_type,
      question: q.question,
      description: q.description ?? '',
      is_required: q.is_required,
      choices: q.choices ?? ['', ''],
    }
  }
  return {
    order_num: props.nextOrderNum,
    question_type: 'rating',
    question: '',
    description: '',
    is_required: false,
    choices: ['', ''],
  }
}

export default function SurveyQuestionFormModal(props: Props) {
  const { mode, question, onClose, onSaved } = props
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
      const next = [...prev.choices]
      next[idx] = value
      return { ...prev, choices: next }
    })
  }

  function addChoice() {
    setForm((prev) => ({ ...prev, choices: [...prev.choices, ''] }))
  }

  function removeChoice(idx: number) {
    setForm((prev) => {
      if (prev.choices.length <= 2) return prev
      return { ...prev, choices: prev.choices.filter((_, i) => i !== idx) }
    })
  }

  const needsChoices = hasChoices(form.question_type)

  const validation = useMemo<string | null>(() => {
    if (!Number.isFinite(form.order_num) || form.order_num < 1) {
      return '순서는 1 이상이어야 해요'
    }
    if (!form.question.trim()) return '질문을 입력해 주세요'
    if (needsChoices) {
      const cleaned = form.choices.map((c) => c.trim()).filter(Boolean)
      if (cleaned.length < 2) return '선택지를 최소 2개 입력해 주세요'
    }
    return null
  }, [form, needsChoices])

  async function handleSubmit() {
    if (validation || submitting) return
    setSubmitting(true)
    setError(null)

    const payload: SurveyQuestionInput = {
      order_num: form.order_num,
      question_type: form.question_type,
      question: form.question.trim(),
      description: form.description.trim() || null,
      is_required: form.is_required,
      choices: needsChoices
        ? form.choices.map((c) => c.trim()).filter(Boolean)
        : null,
      is_active: question?.is_active ?? true,
    }

    let dbError: { message: string } | null = null
    if (mode === 'edit' && question) {
      const { error } = await supabase
        .from('tanggo_survey_questions')
        .update(payload)
        .eq('id', question.id)
      dbError = error
    } else {
      const { error } = await supabase
        .from('tanggo_survey_questions')
        .insert(payload)
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
            {mode === 'create' ? '✨ 새 질문 추가' : '✏ 질문 수정'}
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
          {/* 순서 + 유형 */}
          <div className="flex gap-3">
            <div className="w-24">
              <label className="text-xs font-bold text-text-dark">순서</label>
              <input
                type="number"
                min={1}
                value={form.order_num}
                onChange={(e) => set('order_num', Number(e.target.value))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-bold text-text-dark">유형</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {TYPES.map((t) => {
                  const active = form.question_type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('question_type', t)}
                      className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-colors text-left ${
                        active
                          ? 'border-orange-main bg-orange-main/10 text-orange-main'
                          : 'border-text-dark/10 text-text-dark/60 hover:border-orange-main/40'
                      }`}
                    >
                      <span aria-hidden className="mr-1">
                        {SURVEY_TYPE_EMOJI[t]}
                      </span>
                      {SURVEY_TYPE_LABEL[t]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 질문 */}
          <div>
            <label className="text-xs font-bold text-text-dark">질문</label>
            <textarea
              value={form.question}
              onChange={(e) => set('question', e.target.value)}
              rows={2}
              placeholder="예) 오늘 행사에 얼마나 만족하셨어요?"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="text-xs font-bold text-text-dark">
              설명 <span className="text-text-dark/40 font-medium">(선택)</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="질문 아래 작게 표시할 안내 텍스트"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
            />
          </div>

          {/* 필수 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={(e) => set('is_required', e.target.checked)}
              className="w-5 h-5 accent-orange-main"
            />
            <span className="text-sm font-bold text-text-dark">필수 응답</span>
            <span className="text-xs text-text-dark/50">
              참가자가 반드시 답해야 제출 가능
            </span>
          </label>

          {/* 선택지 */}
          {needsChoices && (
            <div>
              <label className="text-xs font-bold text-text-dark">
                선택지 (최소 2개)
              </label>
              <div className="mt-1.5 flex flex-col gap-2">
                {form.choices.map((c, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="w-6 shrink-0 inline-flex items-center justify-center text-xs font-bold text-text-dark/60 tabular-nums">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={c}
                      onChange={(e) => setChoice(idx, e.target.value)}
                      placeholder={`선택지 ${idx + 1}`}
                      className="flex-1 px-3 py-2 rounded-lg border border-text-dark/10 text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main"
                    />
                    <button
                      type="button"
                      onClick={() => removeChoice(idx)}
                      disabled={form.choices.length <= 2}
                      aria-label="선택지 삭제"
                      className="px-2 rounded-lg text-text-dark/60 hover:bg-[#E94B3C]/10 hover:text-[#E94B3C] disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      🗑
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addChoice}
                  className="self-start mt-1 px-3 py-1.5 rounded-lg text-xs font-bold text-orange-main hover:bg-orange-main/10 border-2 border-dashed border-orange-main/40"
                >
                  + 선택지 추가
                </button>
              </div>
            </div>
          )}

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
