import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { APP_CONFIG } from '../../../config/appConfig'
import type { SurveyQuestion, SurveyResponse } from '../../../lib/surveyTypes'
import {
  SURVEY_TYPE_BADGE,
  SURVEY_TYPE_EMOJI,
  SURVEY_TYPE_LABEL,
} from '../../../lib/surveyTypes'
import {
  downloadSurveyQuestionTemplate,
  exportSurveyQuestionsToExcel,
  exportSurveyResponsesToExcel,
} from '../../../lib/surveyExcel'
import { todayStamp } from '../../../lib/quizExcel'
import SurveyQuestionFormModal from './SurveyQuestionFormModal'
import SurveyImportModal from './SurveyImportModal'

type Modal =
  | null
  | { kind: 'create' }
  | { kind: 'edit'; question: SurveyQuestion }
  | { kind: 'import' }

interface TeamLite {
  id: string
  team_name: string
}

export default function SurveyManager() {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [teams, setTeams] = useState<TeamLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [qRes, rRes, tRes] = await Promise.all([
      supabase
        .from('tanggo_survey_questions')
        .select('*')
        .order('order_num', { ascending: true }),
      supabase.from('tanggo_survey_responses').select('*'),
      supabase.from('tanggo_teams').select('id, team_name'),
    ])
    if (qRes.error || rRes.error || tRes.error) {
      setError(
        qRes.error?.message ??
          rRes.error?.message ??
          tRes.error?.message ??
          '로딩 실패',
      )
      setQuestions([])
      setResponses([])
      setTeams([])
    } else {
      setError(null)
      setQuestions((qRes.data ?? []) as SurveyQuestion[])
      setResponses((rRes.data ?? []) as SurveyResponse[])
      setTeams((tRes.data ?? []) as TeamLite[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const nextOrderNum = useMemo(() => {
    if (questions.length === 0) return 1
    return Math.max(...questions.map((q) => q.order_num)) + 1
  }, [questions])

  const responseCountByQuestion = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of responses) {
      m.set(r.question_id, (m.get(r.question_id) ?? 0) + 1)
    }
    return m
  }, [responses])

  async function toggleActive(q: SurveyQuestion) {
    const next = !q.is_active
    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, is_active: next } : x)),
    )
    const { error } = await supabase
      .from('tanggo_survey_questions')
      .update({ is_active: next })
      .eq('id', q.id)
    if (error) {
      setQuestions((prev) =>
        prev.map((x) => (x.id === q.id ? { ...x, is_active: q.is_active } : x)),
      )
      setToast(`활성 토글 실패: ${error.message}`)
    }
  }

  async function handleDelete(q: SurveyQuestion) {
    const ok = window.confirm(
      `${q.order_num}번 질문을 삭제할까요?\n응답 데이터도 함께 삭제됩니다.\n\n"${q.question}"`,
    )
    if (!ok) return
    const { error } = await supabase
      .from('tanggo_survey_questions')
      .delete()
      .eq('id', q.id)
    if (error) {
      setToast(`삭제 실패: ${error.message}`)
      return
    }
    setQuestions((prev) => prev.filter((x) => x.id !== q.id))
    setToast(`${q.order_num}번 질문을 삭제했어요`)
  }

  async function swapOrder(a: SurveyQuestion, b: SurveyQuestion) {
    // 두 단계 swap (UNIQUE 제약 회피하려고 임시 음수값 사용)
    const tmp = -Math.abs(a.order_num + b.order_num + 1)
    const r1 = await supabase
      .from('tanggo_survey_questions')
      .update({ order_num: tmp })
      .eq('id', a.id)
    if (r1.error) {
      setToast(`순서 변경 실패: ${r1.error.message}`)
      return
    }
    const r2 = await supabase
      .from('tanggo_survey_questions')
      .update({ order_num: a.order_num })
      .eq('id', b.id)
    if (r2.error) {
      setToast(`순서 변경 실패: ${r2.error.message}`)
      return
    }
    const r3 = await supabase
      .from('tanggo_survey_questions')
      .update({ order_num: b.order_num })
      .eq('id', a.id)
    if (r3.error) {
      setToast(`순서 변경 실패: ${r3.error.message}`)
      return
    }
    fetchAll()
  }

  async function moveUp(idx: number) {
    if (idx === 0) return
    await swapOrder(questions[idx], questions[idx - 1])
  }

  async function moveDown(idx: number) {
    if (idx === questions.length - 1) return
    await swapOrder(questions[idx], questions[idx + 1])
  }

  function handleQuestionTemplate() {
    downloadSurveyQuestionTemplate(`${APP_CONFIG.appName}_설문양식.xlsx`)
  }

  function handleResponseDownload() {
    if (questions.length === 0) {
      setToast('등록된 질문이 없어요')
      return
    }
    const filename = `${APP_CONFIG.appName}_설문응답_${todayStamp()}.xlsx`
    exportSurveyResponsesToExcel(questions, responses, teams, filename)
  }

  function handleQuestionExport() {
    if (questions.length === 0) {
      setToast('내보낼 질문이 없어요')
      return
    }
    const filename = `${APP_CONFIG.appName}_설문질문_${todayStamp()}.xlsx`
    exportSurveyQuestionsToExcel(questions, filename)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl" aria-hidden>
            📝
          </span>
          <h2 className="text-lg font-bold text-text-dark">
            설문 질문{' '}
            <span className="text-orange-main tabular-nums">
              {questions.length}
            </span>
            개
          </h2>
          <span className="text-text-dark/30">·</span>
          <p className="text-sm font-bold text-text-dark/70">
            응답{' '}
            <span className="text-mint tabular-nums">{responses.length}</span>건
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModal({ kind: 'import' })}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/80 hover:border-orange-main hover:text-orange-main bg-white"
          >
            📥 엑셀 업로드
          </button>
          <button
            type="button"
            onClick={handleQuestionExport}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/80 hover:border-orange-main hover:text-orange-main bg-white"
          >
            📤 질문 다운로드
          </button>
          <button
            type="button"
            onClick={handleResponseDownload}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/80 hover:border-mint hover:text-[#2C7846] bg-white"
          >
            📊 응답 다운로드
          </button>
          <button
            type="button"
            onClick={handleQuestionTemplate}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/80 hover:border-orange-main hover:text-orange-main bg-white"
          >
            📋 템플릿
          </button>
          <button
            type="button"
            onClick={() => setModal({ kind: 'create' })}
            className="px-3 py-2 rounded-xl bg-orange-main text-white text-sm font-bold hover:bg-orange-sub"
            style={{ boxShadow: 'var(--shadow-orange-sm)' }}
          >
            + 새 질문 추가
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white border border-text-dark/10 overflow-hidden">
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
          <div className="py-20 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/70">
              아직 등록된 설문 질문이 없어요
            </p>
            <p className="mt-1 text-xs text-text-dark/50">
              + 새 질문 추가 또는 📥 엑셀 업로드로 시작하세요
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-text-dark/70">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">
                    순서
                  </th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">
                    유형
                  </th>
                  <th className="px-3 py-2.5 text-left font-bold">질문</th>
                  <th className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                    필수
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                    응답
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                    활성
                  </th>
                  <th className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, idx) => (
                  <tr
                    key={q.id}
                    className="border-t border-text-dark/5 hover:bg-cream/40"
                  >
                    <td className="px-3 py-2.5 tabular-nums font-bold text-text-dark/80">
                      <div className="flex items-center gap-1">
                        <span>{q.order_num}</span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveUp(idx)}
                            disabled={idx === 0}
                            aria-label="위로"
                            className="text-[10px] leading-none text-text-dark/40 hover:text-orange-main disabled:opacity-20"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveDown(idx)}
                            disabled={idx === questions.length - 1}
                            aria-label="아래로"
                            className="text-[10px] leading-none text-text-dark/40 hover:text-orange-main disabled:opacity-20"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${SURVEY_TYPE_BADGE[q.question_type]}`}
                      >
                        <span aria-hidden>
                          {SURVEY_TYPE_EMOJI[q.question_type]}
                        </span>
                        {SURVEY_TYPE_LABEL[q.question_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-dark max-w-md">
                      <div className="truncate" title={q.question}>
                        {q.question}
                      </div>
                      {q.description && (
                        <div className="text-[11px] text-text-dark/50 truncate mt-0.5">
                          {q.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {q.is_required ? (
                        <span className="text-[#E94B3C] font-bold">*</span>
                      ) : (
                        <span className="text-text-dark/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-text-dark/70 font-bold">
                      {responseCountByQuestion.get(q.id) ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={q.is_active}
                        onClick={() => toggleActive(q)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          q.is_active ? 'bg-[#4CAF7F]' : 'bg-text-dark/15'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            q.is_active ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setModal({ kind: 'edit', question: q })}
                        aria-label="수정"
                        className="px-2 py-1 rounded-lg text-text-dark/60 hover:bg-orange-main/10 hover:text-orange-main"
                      >
                        ✏
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(q)}
                        aria-label="삭제"
                        className="ml-1 px-2 py-1 rounded-lg text-text-dark/60 hover:bg-[#E94B3C]/10 hover:text-[#E94B3C]"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.kind === 'create' && (
        <SurveyQuestionFormModal
          mode="create"
          nextOrderNum={nextOrderNum}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setToast('새 질문을 추가했어요')
            fetchAll()
          }}
        />
      )}
      {modal?.kind === 'edit' && (
        <SurveyQuestionFormModal
          mode="edit"
          question={modal.question}
          nextOrderNum={nextOrderNum}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setToast('질문을 수정했어요')
            fetchAll()
          }}
        />
      )}
      {modal?.kind === 'import' && (
        <SurveyImportModal
          onClose={() => setModal(null)}
          onImported={(count) => {
            setModal(null)
            setToast(`${count}개 질문을 일괄 추가했어요`)
            fetchAll()
          }}
        />
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
