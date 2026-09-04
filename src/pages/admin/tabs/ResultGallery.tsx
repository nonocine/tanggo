import { useCallback, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../../lib/supabase'

interface TeamRow {
  id: string
  team_name: string
  start_order: number | null
}

interface ResultRow {
  id: string
  media_url: string | null
  media_type: 'video' | 'photo' | null
  slot_label: string | null
  team_id: string
  quiz_id: string
  processed_at: string | null
  quiz: {
    order_num: number
    question: string
    location_hint: string | null
    mission_subtype: string | null
    day_number: number | null
    location_group: string | null
    location_group_order: number | null
    slot_order: number | null
  } | null
}

const RESULT_SELECT = `
  id, media_url, media_type, slot_label, team_id, quiz_id, processed_at,
  quiz:tanggo_quizzes!inner(
    order_num, question, location_hint, mission_subtype,
    day_number, location_group, location_group_order, slot_order
  )
`.trim()

const DAY1_GROUP = '1일차 미션'
const NO_GROUP = '장소 미지정'

/** 파일명으로 쓸 수 없는 문자를 _ 로 바꾸고 20자로 자른다 */
function safeName(raw: string | null | undefined, fallback = '결과물'): string {
  const base = (raw ?? '')
    .replace(/\s+/g, ' ')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .trim()
  if (!base) return fallback
  const cleaned = base
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\.+$/, '')
    .trim()
  const sliced = cleaned.slice(0, 20).trim()
  return sliced || fallback
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function extOfUrl(url: string, mediaType: 'video' | 'photo' | null): string {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    path = url.split('?')[0]
  }
  const m = /\.([a-z0-9]{1,5})$/i.exec(path)
  if (m) return m[1].toLowerCase()
  return mediaType === 'video' ? 'mp4' : 'jpg'
}

function groupNameOf(r: ResultRow): string {
  const q = r.quiz
  if (q?.location_group) return q.location_group
  // 1일차 미션은 day_number 가 NULL 이고 location_group 도 없다
  if (q?.day_number === 2) return q.location_hint ?? NO_GROUP
  return DAY1_GROUP
}

function groupOrderOf(r: ResultRow): number {
  const q = r.quiz
  if (q?.location_group_order != null) return q.location_group_order
  // 장소 그룹이 없는 1일차 미션은 맨 앞으로
  if (!q?.location_group && q?.day_number !== 2) return -1
  return 9999
}

function slotOf(r: ResultRow): number {
  return r.quiz?.slot_order ?? r.quiz?.order_num ?? 1
}

function compareResults(a: ResultRow, b: ResultRow): number {
  const go = groupOrderOf(a) - groupOrderOf(b)
  if (go !== 0) return go
  const gn = groupNameOf(a).localeCompare(groupNameOf(b))
  if (gn !== 0) return gn
  const so = slotOf(a) - slotOf(b)
  if (so !== 0) return so
  return (a.quiz?.order_num ?? 0) - (b.quiz?.order_num ?? 0)
}

function shortQuestion(q: string | null | undefined, max = 40): string {
  const s = (q ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** ZIP 안에 들어갈 파일명: {팀명}_{장소명}_{슬롯순번}_{슬롯라벨}.{확장자} */
function zipEntryName(teamName: string, r: ResultRow): string {
  const group = safeName(groupNameOf(r), '장소')
  const label = safeName(r.slot_label ?? r.quiz?.question, '미션')
  const ext = extOfUrl(r.media_url!, r.media_type)
  return `${safeName(teamName, '팀')}_${group}_${pad2(slotOf(r))}_${label}.${ext}`
}

function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 2
  while (used.has(`${stem}_${i}${ext}`)) i += 1
  const next = `${stem}_${i}${ext}`
  used.add(next)
  return next
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Progress {
  teamName: string
  current: number
  total: number
  teamIndex?: number
  teamTotal?: number
}

export default function ResultGallery() {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [results, setResults] = useState<ResultRow[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const fetchAll = useCallback(async () => {
    const [teamsRes, resultsRes] = await Promise.all([
      supabase
        .from('tanggo_teams')
        .select('id, team_name, start_order')
        .order('start_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('tanggo_mission_requests')
        .select(RESULT_SELECT)
        .eq('status', 'approved')
        .not('media_url', 'is', null),
    ])

    if (teamsRes.error || resultsRes.error) {
      setError(
        teamsRes.error?.message ?? resultsRes.error?.message ?? '로딩 실패',
      )
      setLoading(false)
      return
    }
    setError(null)
    setTeams((teamsRes.data ?? []) as TeamRow[])
    setResults((resultsRes.data ?? []) as unknown as ResultRow[])
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

  /** team_id -> 정렬된 결과물 */
  const byTeam = useMemo(() => {
    const map = new Map<string, ResultRow[]>()
    for (const r of results) {
      if (!r.media_url) continue
      const arr = map.get(r.team_id)
      if (arr) arr.push(r)
      else map.set(r.team_id, [r])
    }
    for (const arr of map.values()) arr.sort(compareResults)
    return map
  }, [results])

  // 첫 로딩 후 결과물이 있는 첫 팀을 자동 선택
  useEffect(() => {
    if (selectedTeamId || teams.length === 0) return
    const first = teams.find((t) => (byTeam.get(t.id)?.length ?? 0) > 0)
    setSelectedTeamId((first ?? teams[0]).id)
  }, [teams, byTeam, selectedTeamId])

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  )

  const selectedRows = useMemo(
    () => (selectedTeamId ? (byTeam.get(selectedTeamId) ?? []) : []),
    [byTeam, selectedTeamId],
  )

  /** 장소별 섹션 (selectedRows 가 이미 장소순으로 정렬돼 있음) */
  const sections = useMemo(() => {
    const out: { name: string; rows: ResultRow[] }[] = []
    for (const r of selectedRows) {
      const name = groupNameOf(r)
      const last = out[out.length - 1]
      if (last && last.name === name) last.rows.push(r)
      else out.push({ name, rows: [r] })
    }
    return out
  }, [selectedRows])

  // 라이트박스 키보드 조작
  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setLightboxIndex(null)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setLightboxIndex((i) =>
          i === null
            ? null
            : (i - 1 + selectedRows.length) % selectedRows.length,
        )
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setLightboxIndex((i) =>
          i === null ? null : (i + 1) % selectedRows.length,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, selectedRows.length])

  // 팀을 바꾸면 라이트박스 닫기
  useEffect(() => {
    setLightboxIndex(null)
  }, [selectedTeamId])

  /** 한 팀의 결과물을 ZIP 으로 묶어 다운로드 */
  const downloadTeamZip = useCallback(
    async (
      team: TeamRow,
      rows: ResultRow[],
      meta?: { teamIndex: number; teamTotal: number },
    ): Promise<{ ok: number; failed: number }> => {
      const zip = new JSZip()
      const used = new Set<string>()
      let ok = 0
      let failed = 0

      for (let i = 0; i < rows.length; i += 1) {
        setProgress({
          teamName: team.team_name,
          current: i + 1,
          total: rows.length,
          teamIndex: meta?.teamIndex,
          teamTotal: meta?.teamTotal,
        })
        const r = rows[i]
        if (!r.media_url) continue
        try {
          const res = await fetch(r.media_url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          zip.file(uniqueName(used, zipEntryName(team.team_name, r)), blob)
          ok += 1
        } catch {
          failed += 1
        }
      }

      if (ok === 0) return { ok, failed }

      const blob = await zip.generateAsync({ type: 'blob' })
      triggerDownload(blob, `${safeName(team.team_name, '팀')}_결과물.zip`)
      return { ok, failed }
    },
    [],
  )

  async function handleTeamDownload() {
    if (!selectedTeam || progress) return
    const rows = selectedRows
    if (rows.length === 0) return
    const { ok, failed } = await downloadTeamZip(selectedTeam, rows)
    setProgress(null)
    if (ok === 0) {
      setToast(`❌ ${selectedTeam.team_name} — 다운로드에 모두 실패했어요`)
    } else {
      setToast(
        `📦 ${selectedTeam.team_name} — ${ok}개 저장 완료${
          failed > 0 ? ` (실패 ${failed}개)` : ''
        }`,
      )
    }
  }

  async function handleBulkDownload() {
    if (progress) return
    const targets = teams
      .map((t) => ({ team: t, rows: byTeam.get(t.id) ?? [] }))
      .filter((x) => x.rows.length > 0)
    if (targets.length === 0) return
    if (
      !window.confirm(
        `${targets.length}개 팀의 ZIP 파일을 순서대로 내려받습니다. 계속할까요?`,
      )
    ) {
      return
    }

    let okTeams = 0
    let failedFiles = 0
    for (let i = 0; i < targets.length; i += 1) {
      const { team, rows } = targets[i]
      const res = await downloadTeamZip(team, rows, {
        teamIndex: i + 1,
        teamTotal: targets.length,
      })
      if (res.ok > 0) okTeams += 1
      failedFiles += res.failed
      // 브라우저가 연속 다운로드를 막지 않도록 약간의 간격
      if (i < targets.length - 1) await sleep(800)
    }
    setProgress(null)
    setToast(
      `📦 ${okTeams}/${targets.length}개 팀 ZIP 저장 완료${
        failedFiles > 0 ? ` (파일 실패 ${failedFiles}개)` : ''
      }`,
    )
  }

  const totalCount = useMemo(
    () => teams.reduce((sum, t) => sum + (byTeam.get(t.id)?.length ?? 0), 0),
    [teams, byTeam],
  )

  if (loading) {
    return (
      <div className="py-24 text-center text-sm text-text-dark/50">
        불러오는 중...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm font-semibold text-[#E94B3C]">{error}</p>
        <button
          type="button"
          onClick={fetchAll}
          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
        >
          다시 시도
        </button>
      </div>
    )
  }

  const lightboxRow =
    lightboxIndex !== null ? (selectedRows[lightboxIndex] ?? null) : null

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            🖼️
          </span>
          <h2 className="text-lg font-bold text-text-dark">결과물 갤러리</h2>
          <span className="text-xs font-bold text-text-dark/40 tabular-nums">
            총 {totalCount}개
          </span>
        </div>
        <button
          type="button"
          onClick={fetchAll}
          disabled={!!progress}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 text-text-dark/70 hover:bg-cream disabled:opacity-50"
        >
          🔄 새로고침
        </button>
      </div>

      <div className="md:flex md:gap-5 md:items-start">
        {/* 팀 목록 */}
        <aside className="md:w-60 md:shrink-0">
          <button
            type="button"
            onClick={handleBulkDownload}
            disabled={!!progress || totalCount === 0}
            className="w-full mb-3 px-3 py-2.5 rounded-xl bg-text-dark text-white text-sm font-bold hover:bg-text-dark/85 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            📦 전체 팀 ZIP 일괄 다운로드
          </button>
          <ul className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
            {teams.map((t) => {
              const count = byTeam.get(t.id)?.length ?? 0
              const active = t.id === selectedTeamId
              return (
                <li key={t.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => setSelectedTeamId(t.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                      active
                        ? 'bg-orange-main text-white border-orange-main'
                        : 'bg-white text-text-dark/70 border-text-dark/10 hover:border-orange-main hover:text-text-dark'
                    }`}
                  >
                    <span className="truncate">{t.team_name}</span>
                    <span
                      className={`shrink-0 inline-flex items-center justify-center min-w-6 px-1.5 h-6 rounded-full text-[11px] font-black tabular-nums ${
                        active
                          ? 'bg-white/25 text-white'
                          : count > 0
                            ? 'bg-orange-main/10 text-orange-main'
                            : 'bg-text-dark/5 text-text-dark/35'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* 선택한 팀의 결과물 */}
        <section className="flex-1 min-w-0 mt-5 md:mt-0">
          {!selectedTeam ? (
            <div className="py-24 text-center text-sm text-text-dark/50">
              팀을 선택해 주세요
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-text-dark/10">
                <div className="min-w-0">
                  <p className="text-base font-black text-text-dark truncate">
                    <span className="text-orange-main">
                      [{selectedTeam.team_name}]
                    </span>{' '}
                    팀 결과물
                  </p>
                  <p className="mt-0.5 text-xs text-text-dark/50 tabular-nums">
                    승인된 결과물 {selectedRows.length}개
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTeamDownload}
                  disabled={!!progress || selectedRows.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-orange-main text-white text-sm font-bold hover:bg-orange-main/90 active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  📦 이 팀 결과물 전체 다운로드
                </button>
              </div>

              {selectedRows.length === 0 ? (
                <div className="py-24 text-center">
                  <div className="text-4xl mb-3" aria-hidden>
                    📭
                  </div>
                  <p className="text-sm font-bold text-text-dark/60">
                    승인된 결과물이 아직 없습니다
                  </p>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-7">
                  {sections.map((sec) => (
                    <div key={sec.name}>
                      <h3 className="mb-3 text-sm font-black text-text-dark">
                        📍 {sec.name}
                        <span className="ml-2 text-xs font-bold text-text-dark/40 tabular-nums">
                          {sec.rows.length}개
                        </span>
                      </h3>
                      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {sec.rows.map((r) => (
                          <ResultCard
                            key={r.id}
                            row={r}
                            onOpen={() =>
                              setLightboxIndex(selectedRows.indexOf(r))
                            }
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* 전체화면 라이트박스 */}
      {lightboxRow && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="flex items-start justify-between gap-3 px-4 py-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">
                📍 {groupNameOf(lightboxRow)}
                <span className="text-white/40 mx-1.5">·</span>
                <span className="tabular-nums">{pad2(slotOf(lightboxRow))}</span>
                {lightboxRow.slot_label && (
                  <>
                    <span className="text-white/40 mx-1.5">·</span>
                    {lightboxRow.slot_label}
                  </>
                )}
              </p>
              <p className="mt-0.5 text-xs text-white/60 truncate">
                {shortQuestion(lightboxRow.quiz?.question, 80)}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-xs font-bold text-white/60 tabular-nums">
                {lightboxIndex + 1} / {selectedRows.length}
              </span>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="닫기"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/15 text-white text-2xl hover:bg-white/25"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center px-14 pb-4">
            {lightboxRow.media_type === 'video' ? (
              <video
                key={lightboxRow.id}
                src={lightboxRow.media_url ?? undefined}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full rounded-lg bg-black"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                key={lightboxRow.id}
                src={lightboxRow.media_url ?? undefined}
                alt={lightboxRow.slot_label ?? '결과물'}
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>

          {selectedRows.length > 1 && (
            <>
              <button
                type="button"
                aria-label="이전"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex(
                    (lightboxIndex - 1 + selectedRows.length) %
                      selectedRows.length,
                  )
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white/15 text-white text-3xl hover:bg-white/30"
              >
                &#8249;
              </button>
              <button
                type="button"
                aria-label="다음"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((lightboxIndex + 1) % selectedRows.length)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white/15 text-white text-3xl hover:bg-white/30"
              >
                &#8250;
              </button>
            </>
          )}
        </div>
      )}

      {/* 다운로드 진행률 */}
      {progress && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border-4 border-orange-main px-6 py-6 text-center">
            <p className="text-base font-black text-text-dark">
              📦 {progress.teamName}
            </p>
            {progress.teamTotal && (
              <p className="mt-1 text-xs font-bold text-text-dark/50 tabular-nums">
                팀 {progress.teamIndex} / {progress.teamTotal}
              </p>
            )}
            <p className="mt-3 text-sm font-bold text-text-dark/70 tabular-nums">
              {progress.current}/{progress.total} 다운로드 중...
            </p>
            <div className="mt-3 h-2.5 rounded-full bg-text-dark/10 overflow-hidden">
              <div
                className="h-full bg-orange-main transition-all"
                style={{
                  width: `${
                    progress.total > 0
                      ? (progress.current / progress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-3 text-[11px] text-text-dark/40">
              창을 닫지 말고 잠시 기다려 주세요
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-3 rounded-xl bg-text-dark text-white text-sm font-semibold shadow-lg max-w-[90vw] text-center"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function ResultCard({ row, onOpen }: { row: ResultRow; onOpen: () => void }) {
  const isVideo = row.media_type === 'video'
  return (
    <li className="rounded-2xl border border-text-dark/10 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full aspect-square bg-black cursor-zoom-in relative"
        aria-label="크게 보기"
      >
        {isVideo ? (
          <>
            <video
              src={row.media_url ?? undefined}
              preload="metadata"
              muted
              playsInline
              className="w-full h-full object-cover pointer-events-none"
            />
            <span
              className="absolute inset-0 flex items-center justify-center text-4xl"
              aria-hidden
            >
              ▶️
            </span>
          </>
        ) : (
          <img
            src={row.media_url ?? undefined}
            alt={row.slot_label ?? '결과물'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </button>
      <div className="px-2.5 py-2">
        <p className="text-[11px] font-black text-orange-main tabular-nums">
          {pad2(slotOf(row))}
          {row.slot_label && (
            <span className="text-text-dark ml-1.5">🧩 {row.slot_label}</span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-text-dark/60 leading-snug">
          {shortQuestion(row.quiz?.question)}
        </p>
      </div>
    </li>
  )
}
