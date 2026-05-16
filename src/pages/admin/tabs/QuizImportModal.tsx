import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { parseQuizExcel } from '../../../lib/quizExcel'
import type { QuizInput } from '../../../lib/quizTypes'
import { QUIZ_TYPE_LABEL } from '../../../lib/quizTypes'

interface Props {
  onClose: () => void
  onImported: (count: number) => void
}

export default function QuizImportModal({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<QuizInput[]>([])
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([])
  const [parsing, setParsing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleFile(file: File) {
    setParsing(true)
    setServerError(null)
    setFileName(file.name)
    try {
      const { rows, errors } = await parseQuizExcel(file)
      setRows(rows)
      setErrors(errors)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : '엑셀 파싱 실패')
      setRows([])
      setErrors([])
    } finally {
      setParsing(false)
    }
  }

  function reset() {
    setFileName(null)
    setRows([])
    setErrors([])
    setServerError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleConfirm() {
    if (rows.length === 0 || submitting) return
    setSubmitting(true)
    setServerError(null)

    const { error } = await supabase.from('tanggo_quizzes').insert(rows)
    if (error) {
      setServerError(error.message)
      setSubmitting(false)
      return
    }
    onImported(rows.length)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl border-4 border-orange-main my-8"
        style={{ boxShadow: 'var(--shadow-orange)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-text-dark/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-dark">📥 엑셀 일괄 업로드</h2>
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
          {!fileName && (
            <div
              className="flex flex-col items-center justify-center py-10 rounded-2xl border-2 border-dashed border-orange-main/40 bg-orange-main/5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
            >
              <div className="text-4xl mb-2" aria-hidden>
                📄
              </div>
              <p className="text-sm font-bold text-text-dark">
                엑셀 파일을 선택하거나 끌어다 놓으세요
              </p>
              <p className="mt-1 text-xs text-text-dark/50">
                .xlsx / .xls / .csv 지원
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-4 px-4 py-2 rounded-xl bg-orange-main text-white text-sm font-bold hover:bg-orange-sub"
              >
                파일 선택
              </button>
            </div>
          )}

          {fileName && (
            <div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-cream">
                <p className="text-sm font-semibold text-text-dark truncate">
                  📄 {fileName}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="shrink-0 text-xs font-bold text-text-dark/60 hover:text-text-dark underline"
                >
                  다른 파일
                </button>
              </div>

              {parsing && (
                <p className="mt-4 text-sm text-text-dark/60">파일 분석 중...</p>
              )}

              {!parsing && (
                <>
                  <div className="mt-4 flex gap-2">
                    <div className="flex-1 p-3 rounded-xl bg-[#4CAF7F]/10 text-center">
                      <p className="text-xs font-bold text-[#4CAF7F]">정상</p>
                      <p className="mt-0.5 text-xl font-black text-[#4CAF7F]">
                        {rows.length}
                      </p>
                    </div>
                    <div className="flex-1 p-3 rounded-xl bg-[#E94B3C]/10 text-center">
                      <p className="text-xs font-bold text-[#E94B3C]">오류</p>
                      <p className="mt-0.5 text-xl font-black text-[#E94B3C]">
                        {errors.length}
                      </p>
                    </div>
                  </div>

                  {errors.length > 0 && (
                    <div className="mt-3 p-3 rounded-xl bg-[#E94B3C]/5 border border-[#E94B3C]/20">
                      <p className="text-xs font-bold text-[#E94B3C] mb-1.5">
                        오류 행 (수정 후 다시 업로드해주세요)
                      </p>
                      <ul className="max-h-32 overflow-y-auto text-xs text-text-dark/80 space-y-0.5">
                        {errors.map((e, i) => (
                          <li key={i}>
                            <span className="font-bold">{e.row}행:</span>{' '}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rows.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold text-text-dark mb-1.5">
                        미리보기 (상위 {Math.min(rows.length, 8)}개)
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-text-dark/10">
                        <table className="w-full text-xs">
                          <thead className="bg-cream">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-bold">번호</th>
                              <th className="px-2 py-1.5 text-left font-bold">유형</th>
                              <th className="px-2 py-1.5 text-left font-bold">문제</th>
                              <th className="px-2 py-1.5 text-left font-bold">정답</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 8).map((r, i) => (
                              <tr key={i} className="border-t border-text-dark/5">
                                <td className="px-2 py-1.5 tabular-nums">
                                  {r.order_num}
                                </td>
                                <td className="px-2 py-1.5">
                                  {QUIZ_TYPE_LABEL[r.type]}
                                </td>
                                <td className="px-2 py-1.5 truncate max-w-xs">
                                  {r.question}
                                </td>
                                <td className="px-2 py-1.5 truncate max-w-[120px]">
                                  {r.answer ?? '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {serverError && (
                    <p className="mt-3 text-xs font-semibold text-[#E94B3C]">
                      {serverError}
                    </p>
                  )}
                </>
              )}
            </div>
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
            onClick={handleConfirm}
            disabled={rows.length === 0 || submitting || parsing}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              rows.length === 0 || submitting || parsing
                ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                : 'bg-orange-main text-white hover:bg-orange-sub'
            }`}
          >
            {submitting ? '업로드 중...' : `${rows.length}개 일괄 추가`}
          </button>
        </div>
      </div>
    </div>
  )
}
