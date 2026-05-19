import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { refreshTextContents } from '../../../lib/useTextContent'

interface TextRow {
  id: string
  content: string | null
  label?: string | null
  description?: string | null
  placeholder?: string | null
  category?: string | null
  order_num?: number | null
}

// DB에 카테고리/라벨 컬럼이 없거나 비어있을 때 사용할 fallback
const FALLBACK_META: Record<
  string,
  { label: string; description: string; placeholder: string; category: string }
> = {
  landing_welcome_title: {
    label: '시작 화면 안내 제목',
    description: 'Landing 화면 클립보드 카드 제목. 학교명이나 환영 문구.',
    placeholder: '🎯 미션 안내',
    category: 'landing',
  },
  landing_welcome_body: {
    label: '시작 화면 안내 본문',
    description:
      '클립보드 카드 본문 (여러 줄 가능). 행사 소개나 환영 메시지.',
    placeholder:
      '팀을 만들어 학교 곳곳에 숨겨진 미션을 찾고\n가장 빠르게 풀어 1등을 차지하세요!',
    category: 'landing',
  },
  lobby_waiting_message: {
    label: '대기 중 안내',
    description: '대기실에서 행사 시작을 기다릴 때 보여줄 문구.',
    placeholder: '운영자의 신호를 기다려주세요',
    category: 'lobby',
  },
  lobby_go_message: {
    label: '출발 직전 응원 문구',
    description: '"GO!" 큰 글씨 아래에 표시되는 짧은 응원 메시지.',
    placeholder: '지금부터 미션 시작이에요 🚀',
    category: 'lobby',
  },
  result_congrats_title: {
    label: '결과 화면 축하 제목',
    description: '결과 화면 최상단 제목.',
    placeholder: '🏁 미션 완료!',
    category: 'result',
  },
  result_survey_invite: {
    label: '설문 진입 카드 제목',
    description: '결과 화면 하단 노란 설문 카드의 큰 글씨.',
    placeholder: '만족도 조사에 참여해주세요!',
    category: 'result',
  },
  result_survey_subtext: {
    label: '설문 진입 카드 부가 설명',
    description: '설문 카드의 작은 안내 문구.',
    placeholder:
      '1분이면 끝나요. 여러분의 의견이 다음 행사를 더 재밌게 만들어요.',
    category: 'result',
  },
  survey_thanks_title: {
    label: '설문 제출 후 감사 제목',
    description: '설문 응답 후 보여줄 큰 글씨.',
    placeholder: '참여해주셔서 감사합니다!',
    category: 'survey',
  },
  survey_thanks_body: {
    label: '설문 제출 후 감사 부가 메시지',
    description: '감사 화면 부가 안내.',
    placeholder: '여러분의 의견이 다음 행사를 더 재밌게 만들어요.',
    category: 'survey',
  },
}

const CATEGORY_INFO: Record<string, { icon: string; label: string }> = {
  landing: { icon: '📍', label: '시작 화면 (Landing)' },
  lobby: { icon: '🏃', label: '대기실 (Lobby)' },
  result: { icon: '🏁', label: '결과 화면 (Result)' },
  survey: { icon: '📝', label: '설문 (Survey)' },
}

const CATEGORY_ORDER = ['landing', 'lobby', 'result', 'survey']

function metaOf(row: TextRow) {
  const fb = FALLBACK_META[row.id]
  return {
    label: row.label?.trim() || fb?.label || row.id,
    description: row.description?.trim() || fb?.description || '',
    placeholder: row.placeholder?.trim() || fb?.placeholder || '',
    category: row.category?.trim() || fb?.category || 'etc',
    order_num: row.order_num ?? null,
  }
}

export default function TextManager() {
  const [rows, setRows] = useState<TextRow[]>([])
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tanggo_text_contents')
      .select('*')
    if (error) {
      setError(error.message)
      setRows([])
    } else {
      setError(null)
      setRows((data ?? []) as TextRow[])
      const m = new Map<string, string>()
      for (const r of (data ?? []) as TextRow[]) {
        m.set(r.id, r.content ?? '')
      }
      setDrafts(m)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const groups = useMemo(() => {
    // 카테고리별로 그룹핑
    const byCat = new Map<string, TextRow[]>()
    for (const r of rows) {
      const cat = metaOf(r).category
      const arr = byCat.get(cat) ?? []
      arr.push(r)
      byCat.set(cat, arr)
    }
    // 내부 정렬: order_num → id
    for (const arr of byCat.values()) {
      arr.sort((a, b) => {
        const ao = metaOf(a).order_num
        const bo = metaOf(b).order_num
        if (ao !== null && bo !== null && ao !== bo) return ao - bo
        if (ao !== null && bo === null) return -1
        if (ao === null && bo !== null) return 1
        return a.id.localeCompare(b.id)
      })
    }
    // 카테고리 순서: CATEGORY_ORDER 우선
    const cats = Array.from(byCat.keys()).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    return cats.map((c) => ({ category: c, rows: byCat.get(c) ?? [] }))
  }, [rows])

  function setDraft(id: string, value: string) {
    setDrafts((prev) => {
      const m = new Map(prev)
      m.set(id, value)
      return m
    })
  }

  function isDirty(row: TextRow): boolean {
    const draft = drafts.get(row.id) ?? ''
    return draft !== (row.content ?? '')
  }

  async function saveOne(row: TextRow) {
    if (savingId) return
    const draft = drafts.get(row.id) ?? ''
    setSavingId(row.id)
    const { error } = await supabase
      .from('tanggo_text_contents')
      .update({ content: draft.trim() ? draft : null })
      .eq('id', row.id)
    if (error) {
      setToast(`저장 실패: ${error.message}`)
      setSavingId(null)
      return
    }
    setRows((prev) =>
      prev.map((x) =>
        x.id === row.id ? { ...x, content: draft.trim() ? draft : null } : x,
      ),
    )
    setToast('저장되었습니다')
    setSavingId(null)
    void refreshTextContents()
  }

  async function resetOne(row: TextRow) {
    const placeholder = metaOf(row).placeholder
    const ok = window.confirm(
      `"${metaOf(row).label}"을(를) 기본 문구로 되돌립니다.\n계속할까요?`,
    )
    if (!ok) return
    setSavingId(row.id)
    const { error } = await supabase
      .from('tanggo_text_contents')
      .update({ content: null })
      .eq('id', row.id)
    if (error) {
      setToast(`초기화 실패: ${error.message}`)
      setSavingId(null)
      return
    }
    setRows((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, content: null } : x)),
    )
    setDraft(row.id, placeholder)
    setToast('기본값으로 되돌렸습니다')
    setSavingId(null)
    void refreshTextContents()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xl" aria-hidden>
          💬
        </span>
        <h2 className="text-lg font-bold text-text-dark">문구 관리</h2>
        <button
          type="button"
          onClick={() => window.open('/', '_blank', 'noopener')}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 text-text-dark/70 hover:bg-cream"
        >
          🔎 참가자 화면 미리보기
        </button>
      </div>
      <p className="text-xs text-text-dark/60 leading-relaxed">
        행사마다 다른 문구를 자유롭게 수정하세요. 학교명, 환영 메시지 등.
        저장하면 참가자 화면에도 즉시 반영됩니다.
      </p>

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
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-4xl mb-3" aria-hidden>
            📭
          </div>
          <p className="text-sm font-bold text-text-dark/70">
            편집 가능한 문구가 없어요
          </p>
          <p className="mt-1 text-xs text-text-dark/50">
            tanggo_text_contents 테이블에 시드 데이터를 추가하세요
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ category, rows: catRows }) => {
            const info = CATEGORY_INFO[category] ?? {
              icon: '📂',
              label: category,
            }
            return (
              <section key={category} className="flex flex-col gap-3">
                <h3 className="text-sm font-black text-text-dark flex items-center gap-2">
                  <span aria-hidden>{info.icon}</span>
                  {info.label}
                </h3>
                <div className="flex flex-col gap-3">
                  {catRows.map((row) => (
                    <TextItem
                      key={row.id}
                      row={row}
                      draft={drafts.get(row.id) ?? ''}
                      onDraftChange={(v) => setDraft(row.id, v)}
                      onSave={() => saveOne(row)}
                      onReset={() => resetOne(row)}
                      saving={savingId === row.id}
                      dirty={isDirty(row)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
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

function TextItem({
  row,
  draft,
  onDraftChange,
  onSave,
  onReset,
  saving,
  dirty,
}: {
  row: TextRow
  draft: string
  onDraftChange: (v: string) => void
  onSave: () => void
  onReset: () => void
  saving: boolean
  dirty: boolean
}) {
  const meta = metaOf(row)
  const lines = Math.max(2, Math.min(8, draft.split('\n').length + 1))
  return (
    <div className="rounded-2xl border-2 border-text-dark/10 bg-white p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-dark">{meta.label}</p>
          {meta.description && (
            <p className="mt-0.5 text-xs text-text-dark/60 leading-relaxed">
              {meta.description}
            </p>
          )}
          <p className="mt-1 text-[10px] font-mono text-text-dark/30">
            id: {row.id}
          </p>
        </div>
        {dirty && (
          <span className="shrink-0 text-[10px] font-bold text-orange-main bg-orange-main/10 px-1.5 py-0.5 rounded-full">
            수정됨
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={lines}
        placeholder={meta.placeholder}
        className="mt-2 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium leading-relaxed placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 text-text-dark/70 hover:bg-cream disabled:opacity-50"
        >
          ↻ 기본값
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            saving || !dirty
              ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
              : 'bg-orange-main text-white hover:bg-orange-sub'
          }`}
        >
          {saving ? '저장 중...' : '💾 저장'}
        </button>
      </div>
    </div>
  )
}
