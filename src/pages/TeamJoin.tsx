import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import { checkMemberName } from '../lib/teamJoin'

const POLL_INTERVAL_MS = 30_000
const MEMBER_NAME_MAX = 10

interface TeamRow {
  id: string
  team_name: string
  member_count: number | null
  start_order: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

function statusBadge(t: TeamRow) {
  if (t.finished_at)
    return { label: '🏁 완료', cls: 'bg-yellow-accent/30 text-[#8a6f00]' }
  if (t.started_at)
    return { label: '🟢 진행 중', cls: 'bg-mint/25 text-[#2C7846]' }
  return { label: '🟡 시작 전', cls: 'bg-[#F4C430]/20 text-[#A88300]' }
}

export default function TeamJoin() {
  const navigate = useNavigate()
  const setTeam = useTeamStore((s) => s.setTeam)

  const [teams, setTeams] = useState<TeamRow[]>([])
  const [serviceEnded, setServiceEnded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TeamRow | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [teamsRes, configRes] = await Promise.all([
      supabase
        .from('tanggo_teams')
        .select(
          'id, team_name, member_count, start_order, started_at, finished_at, created_at',
        )
        .order('created_at', { ascending: true }),
      supabase
        .from('tanggo_event_config')
        .select('service_ended')
        .eq('id', 1)
        .maybeSingle(),
    ])

    if (teamsRes.error) {
      setError(teamsRes.error.message)
      setLoading(false)
      return
    }
    setError(null)
    setTeams((teamsRes.data ?? []) as TeamRow[])
    setServiceEnded(configRes.data?.service_ended ?? false)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return teams
    return teams.filter((t) => t.team_name.toLowerCase().includes(q))
  }, [teams, search])

  async function handleMemberConfirmed(memberName: string) {
    if (!selected) return

    // service_ended 재확인
    const { data: cfg } = await supabase
      .from('tanggo_event_config')
      .select('service_ended')
      .eq('id', 1)
      .maybeSingle()
    if (cfg?.service_ended) {
      setToast('🔒 행사가 종료되었습니다')
      setSelected(null)
      setTimeout(() => navigate('/', { replace: true }), 1500)
      return
    }

    // 팀 상태 재확인 (오래된 캐시 방지)
    const { data: fresh } = await supabase
      .from('tanggo_teams')
      .select('started_at, finished_at')
      .eq('id', selected.id)
      .maybeSingle()
    const finishedAt = fresh?.finished_at ?? selected.finished_at
    const startedAt = fresh?.started_at ?? selected.started_at

    setTeam(selected.id, selected.team_name, memberName)

    if (finishedAt) {
      navigate('/result', { replace: true })
    } else if (startedAt) {
      navigate('/mission', { replace: true })
    } else {
      navigate('/lobby', { replace: true })
    }
  }

  return (
    <div className="relative min-h-screen bg-cream">
      <header className="relative flex items-center px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="뒤로 가기"
          className="w-10 h-10 inline-flex items-center justify-center rounded-full text-text-dark/70 hover:bg-white hover:text-text-dark transition-colors text-2xl"
        >
          ←
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-bold text-text-dark">
          우리 팀 찾기
        </h1>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-10">
        {/* 검색바 */}
        <div className="relative">
          <span
            aria-hidden
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dark/40 text-base"
          >
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="팀 이름 검색 (비워두면 전체 보기)"
            autoComplete="off"
            className="w-full pl-11 pr-10 py-3.5 rounded-2xl border-2 border-text-dark/10 bg-white text-base font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-full bg-text-dark/10 text-text-dark/60 hover:bg-text-dark/20"
            >
              ×
            </button>
          )}
        </div>

        {serviceEnded && (
          <div className="mt-3 p-3 rounded-xl bg-[#E94B3C]/10 text-center">
            <p className="text-sm font-bold text-[#E94B3C]">
              🔒 행사가 종료되었습니다
            </p>
          </div>
        )}

        {/* 팀 목록 */}
        <div className="mt-4">
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
          ) : teams.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-5xl mb-3" aria-hidden>
                🌿
              </div>
              <p className="text-base font-bold text-text-dark/70">
                아직 등록된 팀이 없습니다
              </p>
              <p className="mt-1 text-sm text-text-dark/50">
                먼저 팀을 만들어주세요
              </p>
              <button
                type="button"
                onClick={() => navigate('/team-create')}
                className="mt-5 px-5 py-3 rounded-2xl bg-orange-main text-white text-sm font-bold hover:bg-orange-sub active:scale-[0.98] transition-all"
                style={{ boxShadow: 'var(--shadow-orange-sm)' }}
              >
                👥 팀 만들러 가기
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3" aria-hidden>
                🔍
              </div>
              <p className="text-sm font-bold text-text-dark/60">
                검색 결과가 없습니다
              </p>
              <p className="mt-1 text-xs text-text-dark/50">
                다른 이름으로 검색해보세요
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filtered.map((t) => {
                const badge = statusBadge(t)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="w-full text-left rounded-2xl border-2 border-text-dark/10 bg-white p-4 hover:-translate-y-0.5 hover:border-orange-main active:translate-y-0 transition-all"
                      style={{ boxShadow: 'var(--shadow-orange-sm)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-black text-text-dark truncate">
                          <span aria-hidden className="mr-1">
                            🏷️
                          </span>
                          {t.team_name}
                        </p>
                        <span
                          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-bold text-text-dark/60">
                        👥 <span className="tabular-nums">{t.member_count ?? 0}</span>명
                        {t.start_order != null && (
                          <>
                            {' · '}출발순서{' '}
                            <span className="tabular-nums">
                              {t.start_order}
                            </span>
                            등
                          </>
                        )}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {teams.length > 0 && (
          <p className="mt-6 text-center text-[11px] text-text-dark/40">
            본인 팀이 없으면 [팀 만들기]로 새로 만들어주세요
          </p>
        )}
      </main>

      {selected && (
        <MemberConfirmModal
          team={selected}
          onClose={() => setSelected(null)}
          onConfirmed={(matchedName) => {
            handleMemberConfirmed(matchedName)
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

function MemberConfirmModal({
  team,
  onClose,
  onConfirmed,
}: {
  team: TeamRow
  onClose: () => void
  onConfirmed: (matchedName: string) => void
}) {
  const [name, setName] = useState('')
  const [checking, setChecking] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [borderRed, setBorderRed] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !checking) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, checking])

  useEffect(() => {
    if (!borderRed) return
    const t = setTimeout(() => setBorderRed(false), 500)
    return () => clearTimeout(t)
  }, [borderRed])

  // shakeKey 변할 때마다 input이 remount되므로 focus 복원
  useEffect(() => {
    if (shakeKey > 0) inputRef.current?.focus()
  }, [shakeKey])

  async function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed || checking) return
    setChecking(true)
    setErrorMsg(null)

    const matched = await checkMemberName(team.id, name)
    if (!matched) {
      setErrorMsg('❌ 이 팀에 등록된 이름이 아니에요. 다시 확인해주세요')
      setBorderRed(true)
      setShakeKey((k) => k + 1)
      setChecking(false)
      return
    }
    onConfirmed(matched.name)
  }

  const canSubmit = name.trim().length > 0 && !checking

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-4 overflow-y-auto"
      onClick={() => {
        if (!checking) onClose()
      }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl border-4 border-orange-main my-8"
        style={{ boxShadow: 'var(--shadow-orange)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-text-dark/10 flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-black text-text-dark">
              <span aria-hidden className="mr-1">
                🏷️
              </span>
              {team.team_name}
            </p>
            <p className="mt-0.5 text-xs font-bold text-text-dark/60">
              👥 <span className="tabular-nums">{team.member_count ?? 0}</span>명
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={checking}
            aria-label="닫기"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full text-text-dark/50 hover:bg-cream hover:text-text-dark text-xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm font-bold text-text-dark">
            본인 이름을 정확히 입력하세요
          </p>

          <input
            key={shakeKey}
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, MEMBER_NAME_MAX))
              if (errorMsg) setErrorMsg(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
            placeholder="본인 이름"
            maxLength={MEMBER_NAME_MAX}
            autoComplete="off"
            autoFocus
            className={`mt-3 w-full px-4 py-3.5 rounded-2xl border-2 bg-white text-lg font-bold placeholder:text-text-dark/30 focus:outline-none focus:ring-2 transition-colors ${
              borderRed
                ? 'border-[#E94B3C] focus:border-[#E94B3C] focus:ring-[#E94B3C]/20'
                : 'border-text-dark/10 focus:border-orange-main focus:ring-orange-main/20'
            } ${shakeKey > 0 ? 'animate-shake' : ''}`}
          />

          <div className="mt-1.5 min-h-[1.25rem] text-xs font-semibold">
            {errorMsg && <span className="text-[#E94B3C]">{errorMsg}</span>}
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className={`mt-2 w-full rounded-2xl py-3.5 text-base font-bold transition-all duration-150 ${
              canSubmit
                ? 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.98]'
                : 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
            }`}
            style={canSubmit ? { boxShadow: 'var(--shadow-orange-sm)' } : undefined}
          >
            {checking ? '확인 중...' : '✅ 확인'}
          </button>

          <div className="mt-5 pt-4 border-t border-text-dark/10">
            <p className="text-xs font-bold text-text-dark/70">📌 안내</p>
            <p className="mt-1 text-xs text-text-dark/60 leading-relaxed">
              본인 이름이 팀에 등록되어 있어야 입장할 수 있어요
            </p>

            <p className="mt-3 text-xs font-bold text-text-dark/70">
              본인 이름이 없으면?
            </p>
            <div className="mt-1 px-3 py-2 rounded-xl bg-[#FFF8DC] text-xs text-[#7a5e00]">
              <p className="font-bold">✋ 운영자에게 문의</p>
              <p className="mt-0.5 text-[11px]">
                현장 운영자에게 팀 명단 수정을 요청해주세요
              </p>
            </div>

            <p className="mt-3 text-[11px] text-text-dark/40 text-center">
              본인 팀이 아닌 다른 팀에는 들어갈 수 없어요
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
