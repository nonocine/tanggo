import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_CONFIG } from '../../../config/appConfig'
import { SEASON_CONFIG } from '../../../config/seasonConfig'
import {
  fetchReportData,
  formatElapsed,
  type ReportData,
} from '../../../lib/reportData'
import {
  downloadBlob,
  generateReportDocx,
} from '../../../lib/reportDocx'
import { exportReportExcel } from '../../../lib/reportExcel'
import { todayStamp } from '../../../lib/quizExcel'
import { SURVEY_TYPE_EMOJI, SURVEY_TYPE_LABEL } from '../../../lib/surveyTypes'
import {
  NARRATIVE_SECTIONS,
  clearNarrativeOverrides,
  generateNarrative,
  loadNarrativeOverrides,
  mergeNarrative,
  saveNarrativeOverrides,
  type NarrativeReport,
} from '../../../lib/reportNarrative'

export default function ReportManager() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [docxBusy, setDocxBusy] = useState(false)
  const [xlsxBusy, setXlsxBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [narrative, setNarrative] = useState<NarrativeReport | null>(null)
  const [overrideKeys, setOverrideKeys] = useState<Set<keyof NarrativeReport>>(
    new Set(),
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchReportData()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 데이터 로드 후 자동 초안 생성 + localStorage 덮어쓰기
  useEffect(() => {
    if (!data) return
    const base = generateNarrative(data)
    const overrides = loadNarrativeOverrides()
    setNarrative(mergeNarrative(base, overrides))
    setOverrideKeys(new Set(Object.keys(overrides) as (keyof NarrativeReport)[]))
  }, [data])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // debounce 저장
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(
    (key: keyof NarrativeReport, value: string | null) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const prev = loadNarrativeOverrides()
        const next = { ...prev, [key]: value }
        saveNarrativeOverrides(next)
      }, 1000)
    },
    [],
  )

  function updateSection(key: keyof NarrativeReport, value: string) {
    if (!narrative) return
    setNarrative({ ...narrative, [key]: value })
    setOverrideKeys((prev) => {
      const n = new Set(prev)
      n.add(key)
      return n
    })
    scheduleSave(key, value)
  }

  function resetNarrative() {
    if (!data) return
    const ok = window.confirm(
      '수정한 내용을 모두 삭제하고 자동 생성 초안으로 되돌립니다.\n계속할까요?',
    )
    if (!ok) return
    clearNarrativeOverrides()
    setNarrative(generateNarrative(data))
    setOverrideKeys(new Set())
    setToast('서술형 보고서를 초기화했어요')
  }

  const visibleSections = useMemo(() => {
    if (!narrative) return []
    return NARRATIVE_SECTIONS.filter((s) => {
      if (s.key === 'survey') return narrative.survey !== null
      return true
    })
  }, [narrative])

  async function handleDocx() {
    if (!data || !narrative || docxBusy) return
    setDocxBusy(true)
    try {
      const blob = await generateReportDocx(data, narrative)
      downloadBlob(
        blob,
        `${APP_CONFIG.appName}_결과보고서_${todayStamp()}.docx`,
      )
      setToast('Word 보고서를 다운로드했어요')
    } catch (e) {
      setToast(`보고서 생성 실패: ${e instanceof Error ? e.message : ''}`)
    }
    setDocxBusy(false)
  }

  async function handleXlsx() {
    if (!data || !narrative || xlsxBusy) return
    setXlsxBusy(true)
    try {
      exportReportExcel(
        data,
        narrative,
        `${APP_CONFIG.appName}_결과보고서_${todayStamp()}.xlsx`,
      )
      setToast('엑셀 명단을 다운로드했어요')
    } catch (e) {
      setToast(`엑셀 생성 실패: ${e instanceof Error ? e.message : ''}`)
    }
    setXlsxBusy(false)
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-text-dark/50">
        보고서 데이터 집계 중...
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold text-[#E94B3C]">
          {error ?? '데이터 없음'}
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
        >
          다시 시도
        </button>
      </div>
    )
  }

  const b = data.basic
  const s = data.surveyStats
  const ratingAvg =
    s.ratings.length === 0
      ? null
      : s.ratings
          .filter((r) => r.avg !== null)
          .reduce((acc, r) => acc + (r.avg as number), 0) /
        Math.max(1, s.ratings.filter((r) => r.avg !== null).length)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          📊
        </span>
        <h2 className="text-lg font-bold text-text-dark">결과 보고서</h2>
        <span className="ml-auto text-[11px] text-text-dark/40">
          {SEASON_CONFIG.eventDate}
        </span>
      </div>

      {/* 상단 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <StatCard icon="📋" label="등록 팀" value={`${b.totalTeams}`} unit="팀" />
        <StatCard icon="👥" label="청소년" value={`${b.totalMembers}`} unit="명" />
        <StatCard
          icon="🏁"
          label="완료"
          value={`${b.finishedTeams}`}
          unit={`팀 (${b.goalRatePct}%)`}
          tone="gold"
        />
        <StatCard
          icon="📝"
          label="설문 응답"
          value={`${s.respondentCount}`}
          unit="명"
          tone="green"
        />
      </div>

      {/* 다운로드 액션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleDocx}
          disabled={docxBusy}
          className={`px-5 py-4 rounded-2xl text-base font-black transition-all ${
            docxBusy
              ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
              : 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.99]'
          }`}
          style={!docxBusy ? { boxShadow: 'var(--shadow-orange-sm)' } : undefined}
        >
          📄 {docxBusy ? '생성 중...' : 'Word 보고서 다운로드'}
        </button>
        <button
          type="button"
          onClick={handleXlsx}
          disabled={xlsxBusy}
          className={`px-5 py-4 rounded-2xl text-base font-black transition-all ${
            xlsxBusy
              ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
              : 'bg-mint text-text-dark hover:bg-[#6FD491] active:scale-[0.99]'
          }`}
        >
          📊 {xlsxBusy ? '생성 중...' : '엑셀 명단 다운로드'}
        </button>
      </div>

      {/* 미리보기: 행사 개요 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-3">📌 행사 개요</h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row term="행사명" desc={SEASON_CONFIG.seasonNameFormal} />
          <Row term="일시" desc={SEASON_CONFIG.eventDate} />
          <Row term="주최" desc={APP_CONFIG.appOrganizer} />
          <Row term="평균 진행률" desc={`${b.avgCorrect}개 / ${b.activeQuizCount}개 (${b.avgCorrectPct}%)`} />
          <Row term="평균 소요 시간" desc={formatElapsed(b.avgElapsedSec)} />
          <Row term="시작 / 완료 팀" desc={`${b.startedTeams} / ${b.finishedTeams}팀`} />
        </dl>
      </section>

      {/* 미션별 정답률 막대 차트 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-3">
          🎯 미션별 정답률
        </h3>
        {data.missionStats.length === 0 ? (
          <p className="text-sm text-text-dark/50">등록된 활성 미션이 없어요</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.missionStats.map((m) => {
              const pct = Math.round(m.correctRate * 100)
              const barColor =
                pct >= 70 ? 'bg-mint' : pct >= 40 ? 'bg-[#F4C430]' : 'bg-[#E94B3C]'
              return (
                <li key={m.quiz.id} className="flex items-center gap-3 text-sm">
                  <span className="w-8 shrink-0 font-black text-orange-main tabular-nums">
                    #{m.quiz.order_num}
                  </span>
                  <span
                    className="flex-1 truncate text-text-dark"
                    title={m.quiz.question}
                  >
                    {m.quiz.question}
                  </span>
                  <div className="w-32 md:w-48 h-2 rounded-full bg-text-dark/10 overflow-hidden shrink-0">
                    <div
                      className={`h-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs font-bold text-text-dark/70 tabular-nums">
                    {m.correctCount} / {b.totalTeams}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs font-black text-text-dark tabular-nums">
                    {pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 팀 순위 TOP 10 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-3">🏆 팀 순위 TOP 10</h3>
        {data.rankings.length === 0 ? (
          <p className="text-sm text-text-dark/50">등록된 팀이 없어요</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {data.rankings.slice(0, 10).map((r) => {
              const medal =
                r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''
              const cls =
                r.rank <= 3
                  ? 'bg-yellow-accent/15 border-yellow-accent/40'
                  : 'bg-cream/40 border-text-dark/5'
              return (
                <li
                  key={r.team.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cls}`}
                >
                  <span className="w-10 shrink-0 text-sm font-black text-text-dark tabular-nums">
                    {medal ? medal : `${r.rank}위`}
                  </span>
                  <span className="flex-1 truncate text-sm font-bold text-text-dark">
                    {r.team.team_name}
                  </span>
                  <span className="text-xs font-bold text-orange-main tabular-nums">
                    {r.correctCount} / {r.totalQuizzes}
                  </span>
                  <span className="w-12 text-right text-xs text-text-dark/60 tabular-nums">
                    {r.pct}%
                  </span>
                  <span className="hidden md:inline w-24 text-right text-[11px] text-text-dark/50 tabular-nums">
                    {formatElapsed(r.elapsedSec)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* 설문 응답 요약 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-3">📝 설문 응답 요약</h3>
        {s.questionCount === 0 ? (
          <p className="text-sm text-text-dark/50">
            등록된 설문 질문이 없어요. "설문 관리" 탭에서 추가하세요.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MiniStat label="질문" value={`${s.questionCount}`} unit="개" />
              <MiniStat label="응답자" value={`${s.respondentCount}`} unit="명" />
              <MiniStat label="총 응답" value={`${s.responseCount}`} unit="건" />
              <MiniStat
                label="별점 평균"
                value={ratingAvg !== null ? ratingAvg.toFixed(2) : '—'}
                unit="/ 5"
                highlight
              />
            </div>

            {/* 별점 분포 */}
            {s.ratings.length > 0 && (
              <div className="flex flex-col gap-2">
                {s.ratings.map((r) => (
                  <div
                    key={r.question.id}
                    className="rounded-xl bg-cream/50 px-3 py-2"
                  >
                    <p className="text-xs font-bold text-text-dark truncate">
                      <span className="text-orange-main mr-1">
                        Q{r.question.order_num}.
                      </span>
                      {r.question.question}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm font-black text-yellow-accent tabular-nums">
                        ⭐ {r.avg !== null ? r.avg.toFixed(2) : '—'}
                      </span>
                      <span className="text-[11px] text-text-dark/50">
                        ({r.count}명 응답)
                      </span>
                      <div className="flex gap-0.5 ml-auto">
                        {r.distribution.map((n, i) => (
                          <span
                            key={i}
                            title={`${i + 1}점: ${n}명`}
                            className="text-[10px] font-bold text-text-dark/60 tabular-nums w-6 text-center"
                          >
                            {i + 1}★ {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 객관식 분포 */}
            {s.choices.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {s.choices.map((c) => (
                  <div
                    key={c.question.id}
                    className="rounded-xl border border-text-dark/10 px-3 py-2"
                  >
                    <p className="text-xs font-bold text-text-dark">
                      <span className="text-orange-main mr-1">
                        {SURVEY_TYPE_EMOJI[c.question.question_type]}
                      </span>
                      Q{c.question.order_num}. {c.question.question}
                      <span className="text-text-dark/50 ml-1.5 font-medium">
                        · {SURVEY_TYPE_LABEL[c.question.question_type]} · 응답{' '}
                        {c.count}건
                      </span>
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {c.buckets.map((b) => (
                        <li
                          key={b.choice}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="flex-1 truncate text-text-dark/80">
                            {b.choice}
                          </span>
                          <div className="w-32 h-1.5 rounded-full bg-text-dark/10 overflow-hidden shrink-0">
                            <div
                              className="h-full bg-orange-main transition-all"
                              style={{ width: `${b.pct}%` }}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums font-bold text-text-dark/70">
                            {b.count} ({b.pct}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* 서술형 보고서 (편집 가능) */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-text-dark">
            📝 서술형 보고서 <span className="text-text-dark/40 font-medium">(편집 가능)</span>
          </h3>
          <button
            type="button"
            onClick={resetNarrative}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 text-text-dark/70 hover:bg-cream"
          >
            🔄 초기화
          </button>
        </div>
        <p className="text-[11px] text-text-dark/50 mb-3">
          자동 생성된 초안을 자유롭게 수정할 수 있어요. 수정한 내용은 자동 저장되며 Word/엑셀 다운로드에 그대로 반영됩니다.
        </p>
        {narrative ? (
          <div className="flex flex-col gap-3">
            {visibleSections.map((s) => {
              const value = narrative[s.key] ?? ''
              const edited = overrideKeys.has(s.key)
              return (
                <div key={s.key} className="rounded-xl bg-cream/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-xs font-bold text-text-dark">
                      {s.title}
                    </p>
                    {edited && (
                      <span className="text-[10px] font-bold text-orange-main bg-orange-main/10 px-1.5 py-0.5 rounded-full">
                        수정됨
                      </span>
                    )}
                  </div>
                  <textarea
                    value={value}
                    onChange={(e) => updateSection(s.key, e.target.value)}
                    rows={Math.min(8, Math.max(3, value.split('\n').length + 1))}
                    className="w-full px-3 py-2 rounded-lg border-2 border-text-dark/10 bg-white text-sm font-medium leading-relaxed text-text-dark focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-text-dark/50">서술형 보고서 준비 중...</p>
        )}
      </section>

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

function StatCard({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: string
  label: string
  value: string
  unit?: string
  tone?: 'green' | 'gold'
}) {
  const toneCls =
    tone === 'green'
      ? 'border-mint/40 bg-mint/5'
      : tone === 'gold'
        ? 'border-yellow-accent/40 bg-yellow-accent/10'
        : 'border-text-dark/10 bg-white'
  return (
    <div className={`px-3 py-3 rounded-xl border-2 ${toneCls}`}>
      <p className="text-[11px] font-bold text-text-dark/60">
        <span className="mr-1" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-0.5 text-xl font-black text-text-dark tabular-nums">
        {value}
        {unit && (
          <span className="text-xs font-bold text-text-dark/50 ml-0.5">
            {unit}
          </span>
        )}
      </p>
    </div>
  )
}

function MiniStat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string
  value: string
  unit?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`px-3 py-2 rounded-lg ${
        highlight ? 'bg-yellow-accent/15' : 'bg-cream/60'
      }`}
    >
      <p className="text-[11px] font-bold text-text-dark/60">{label}</p>
      <p
        className={`text-lg font-black tabular-nums ${
          highlight ? 'text-[#8a6f00]' : 'text-text-dark'
        }`}
      >
        {value}
        {unit && (
          <span className="text-xs font-bold text-text-dark/50 ml-0.5">
            {unit}
          </span>
        )}
      </p>
    </div>
  )
}

function Row({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-xs font-bold text-text-dark/50">
        {term}
      </dt>
      <dd className="text-text-dark font-semibold">{desc}</dd>
    </div>
  )
}
