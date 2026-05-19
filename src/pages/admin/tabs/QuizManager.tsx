import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { Quiz } from '../../../lib/quizTypes'
import {
  QUIZ_TYPE_BADGE,
  QUIZ_TYPE_EMOJI,
  QUIZ_TYPE_LABEL,
  MISSION_SUBTYPE_SHORT,
} from '../../../lib/quizTypes'
import {
  downloadQuizTemplate,
  exportQuizzesToExcel,
  todayStamp,
} from '../../../lib/quizExcel'
import { APP_CONFIG } from '../../../config/appConfig'
import QuizFormModal from './QuizFormModal'
import QuizImportModal from './QuizImportModal'

type Modal = null | { kind: 'create' } | { kind: 'edit'; quiz: Quiz } | { kind: 'import' }

export default function QuizManager() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchQuizzes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tanggo_quizzes')
      .select('*')
      .order('order_num', { ascending: true })
    if (error) {
      setError(error.message)
      setQuizzes([])
    } else {
      setError(null)
      setQuizzes((data ?? []) as Quiz[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchQuizzes()
  }, [fetchQuizzes])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const nextOrderNum = useMemo(() => {
    if (quizzes.length === 0) return 1
    return Math.max(...quizzes.map((q) => q.order_num)) + 1
  }, [quizzes])

  async function toggleActive(q: Quiz) {
    const next = !q.is_active
    setQuizzes((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, is_active: next } : x)),
    )
    const { error } = await supabase
      .from('tanggo_quizzes')
      .update({ is_active: next })
      .eq('id', q.id)
    if (error) {
      // rollback
      setQuizzes((prev) =>
        prev.map((x) => (x.id === q.id ? { ...x, is_active: q.is_active } : x)),
      )
      setToast(`활성 토글 실패: ${error.message}`)
    }
  }

  async function handleDelete(q: Quiz) {
    const ok = window.confirm(`${q.order_num}번 미션을 삭제할까요?\n\n"${q.question}"`)
    if (!ok) return
    const { error } = await supabase.from('tanggo_quizzes').delete().eq('id', q.id)
    if (error) {
      setToast(`삭제 실패: ${error.message}`)
      return
    }
    setQuizzes((prev) => prev.filter((x) => x.id !== q.id))
    setToast(`${q.order_num}번 미션을 삭제했어요`)
  }

  function handleDownload() {
    if (quizzes.length === 0) {
      setToast('내보낼 미션이 없어요')
      return
    }
    const filename = `${APP_CONFIG.appName}_미션목록_${todayStamp()}.xlsx`
    exportQuizzesToExcel(quizzes, filename)
  }

  function handleTemplate() {
    downloadQuizTemplate(`${APP_CONFIG.appName}_미션양식.xlsx`)
  }

  return (
    <div>
      {/* 상단 액션 바 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            📋
          </span>
          <h2 className="text-lg font-bold text-text-dark">
            등록된 미션{' '}
            <span className="text-orange-main tabular-nums">{quizzes.length}</span>
            개
          </h2>
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
            onClick={handleDownload}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/80 hover:border-orange-main hover:text-orange-main bg-white"
          >
            📤 엑셀 다운로드
          </button>
          <button
            type="button"
            onClick={handleTemplate}
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
            + 새 미션 추가
          </button>
        </div>
      </div>

      {/* 목록 */}
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
              onClick={fetchQuizzes}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
            >
              다시 시도
            </button>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/70">
              아직 등록된 미션이 없어요
            </p>
            <p className="mt-1 text-xs text-text-dark/50">
              + 새 미션 추가 또는 📥 엑셀 업로드로 시작하세요
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-text-dark/70">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">번호</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">유형</th>
                  <th className="px-3 py-2.5 text-left font-bold">문제</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">위치 힌트</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">정답</th>
                  <th className="px-3 py-2.5 text-center font-bold whitespace-nowrap">활성</th>
                  <th className="px-3 py-2.5 text-right font-bold whitespace-nowrap">작업</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q) => (
                  <tr key={q.id} className="border-t border-text-dark/5 hover:bg-cream/40">
                    <td className="px-3 py-2.5 tabular-nums font-bold text-text-dark/80">
                      {q.order_num}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${QUIZ_TYPE_BADGE[q.type]}`}
                      >
                        <span aria-hidden>{QUIZ_TYPE_EMOJI[q.type]}</span>
                        {q.type === 'mission' && q.mission_subtype
                          ? `현장(${MISSION_SUBTYPE_SHORT[q.mission_subtype]})`
                          : QUIZ_TYPE_LABEL[q.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-dark max-w-md">
                      <div className="truncate" title={q.question}>
                        {q.question}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-dark/60 whitespace-nowrap max-w-[180px]">
                      <div className="truncate" title={q.location_hint ?? ''}>
                        {q.location_hint || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-dark/80 whitespace-nowrap max-w-[160px]">
                      <div className="truncate" title={q.answer ?? ''}>
                        {q.type === 'mission'
                          ? '운영자 승인'
                          : q.type === 'choice' && q.answer
                            ? `${q.answer}번`
                            : q.answer || '—'}
                      </div>
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
                        onClick={() => setModal({ kind: 'edit', quiz: q })}
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
        <QuizFormModal
          mode="create"
          nextOrderNum={nextOrderNum}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setToast('새 미션을 추가했어요')
            fetchQuizzes()
          }}
        />
      )}
      {modal?.kind === 'edit' && (
        <QuizFormModal
          mode="edit"
          quiz={modal.quiz}
          nextOrderNum={nextOrderNum}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setToast('미션을 수정했어요')
            fetchQuizzes()
          }}
        />
      )}
      {modal?.kind === 'import' && (
        <QuizImportModal
          onClose={() => setModal(null)}
          onImported={(count) => {
            setModal(null)
            setToast(`${count}개 미션을 일괄 추가했어요`)
            fetchQuizzes()
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
