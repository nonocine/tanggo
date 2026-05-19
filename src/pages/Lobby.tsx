import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import { useText } from '../lib/useTextContent'
import AnnouncementBanner from '../components/AnnouncementBanner'

const POLL_INTERVAL_MS = 5000

interface TeamRow {
  id: string
  team_name: string
  start_order: number | null
  member_count: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

interface EventConfigRow {
  event_start_at: string | null
  start_interval_seconds: number
  service_ended: boolean
}

type LobbyState =
  | { kind: 'loading' }
  | { kind: 'service_ended' }
  | { kind: 'go_to_result' }
  | { kind: 'go_to_mission' }
  | { kind: 'waiting' }
  | { kind: 'countdown'; secondsLeft: number; ourStartAt: number }
  | { kind: 'go' }

function computeState(
  team: TeamRow | null,
  config: EventConfigRow | null,
  now: number,
): LobbyState {
  if (!team || !config) return { kind: 'loading' }
  if (config.service_ended) return { kind: 'service_ended' }
  if (team.finished_at) return { kind: 'go_to_result' }
  if (team.started_at) return { kind: 'go_to_mission' }
  if (!config.event_start_at) return { kind: 'waiting' }

  const startMs = new Date(config.event_start_at).getTime()
  if (Number.isNaN(startMs) || now < startMs) return { kind: 'waiting' }

  const offsetSec = ((team.start_order ?? 1) - 1) * config.start_interval_seconds
  const ourStartMs = startMs + offsetSec * 1000

  if (now < ourStartMs) {
    return {
      kind: 'countdown',
      secondsLeft: Math.ceil((ourStartMs - now) / 1000),
      ourStartAt: ourStartMs,
    }
  }

  return { kind: 'go' }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, secondsLeft)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${pad(sec)}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Lobby() {
  const navigate = useNavigate()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)

  const [team, setTeam] = useState<TeamRow | null>(null)
  const [config, setConfig] = useState<EventConfigRow | null>(null)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)
  const startingRef = useRef(false)

  const fetchData = useCallback(async () => {
    if (!teamId) return
    const [teamRes, configRes] = await Promise.all([
      supabase
        .from('tanggo_teams')
        .select(
          'id, team_name, start_order, member_count, started_at, finished_at, created_at',
        )
        .eq('id', teamId)
        .maybeSingle(),
      supabase
        .from('tanggo_event_config')
        .select('event_start_at, start_interval_seconds, service_ended')
        .eq('id', 1)
        .maybeSingle(),
    ])
    if (teamRes.error || configRes.error) {
      setError(teamRes.error?.message ?? configRes.error?.message ?? '로딩 실패')
      return
    }
    if (teamRes.data) setTeam(teamRes.data as TeamRow)
    if (configRes.data) setConfig(configRes.data as EventConfigRow)
    setError(null)
  }, [teamId])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchData])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const state = computeState(team, config, now)

  // 자동 리다이렉트
  useEffect(() => {
    if (state.kind === 'go_to_result') {
      navigate('/result', { replace: true })
    } else if (state.kind === 'go_to_mission') {
      navigate('/mission', { replace: true })
    }
  }, [state.kind, navigate])

  // 우리 팀 차례 도래 시 자동으로 started_at 설정 + 3초 후 /mission
  useEffect(() => {
    if (state.kind !== 'go') return
    if (!team || team.started_at || startingRef.current) return
    startingRef.current = true

    const nowIso = new Date().toISOString()
    supabase
      .from('tanggo_teams')
      .update({ started_at: nowIso })
      .eq('id', team.id)
      .then(() => {
        fetchData()
      })

    const t = setTimeout(() => navigate('/mission', { replace: true }), 3000)
    return () => clearTimeout(t)
  }, [state.kind, team, fetchData, navigate])

  async function goNow() {
    if (!team) return
    if (!team.started_at) {
      await supabase
        .from('tanggo_teams')
        .update({ started_at: new Date().toISOString() })
        .eq('id', team.id)
    }
    navigate('/mission', { replace: true })
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AnnouncementBanner />

      <header className="px-4 pt-4 pb-2 text-center">
        <p className="text-xs font-medium text-text-dark/50">
          🏷️ {teamName ?? team?.team_name ?? '???'} 팀
        </p>
      </header>

      <main className="flex-1 mx-auto w-full max-w-md px-5 py-5 flex flex-col">
        {error ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-[#E94B3C]">{error}</p>
            <button
              type="button"
              onClick={fetchData}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
            >
              다시 시도
            </button>
          </div>
        ) : state.kind === 'loading' ? (
          <div className="py-16 text-center text-sm text-text-dark/50">
            불러오는 중...
          </div>
        ) : state.kind === 'service_ended' ? (
          <ServiceEndedBlock />
        ) : state.kind === 'go' ? (
          <GoBlock teamName={teamName ?? team?.team_name ?? '???'} onGo={goNow} />
        ) : state.kind === 'countdown' ? (
          <CountdownBlock
            secondsLeft={state.secondsLeft}
            startOrder={team?.start_order ?? null}
          />
        ) : (
          <WaitingBlock team={team!} eventStartAt={config?.event_start_at ?? null} />
        )}
      </main>
    </div>
  )
}

function WaitingBlock({
  team,
  eventStartAt,
}: {
  team: TeamRow
  eventStartAt: string | null
}) {
  const waitingMessage = useText(
    'lobby_waiting_message',
    '운영자의 신호를 기다려주세요',
  )
  return (
    <>
      <section
        className="relative rounded-3xl border-4 border-orange-main bg-white px-6 pt-10 pb-6 text-center"
        style={{ boxShadow: 'var(--shadow-orange)' }}
      >
        <div
          aria-hidden
          className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center"
        >
          <div className="w-24 h-6 rounded-lg bg-gradient-to-b from-gray-300 to-gray-400 shadow-md" />
          <div className="w-3 h-2 -mt-0.5 rounded-b-sm bg-gray-400" />
        </div>

        <p className="text-sm font-bold text-text-dark/60">🚦 출발 대기 중</p>
        <h2 className="mt-1 text-2xl font-black text-text-dark">{team.team_name}</h2>
        <p className="mt-2 text-sm font-bold text-orange-main">
          출발 순서:{' '}
          <span className="tabular-nums">{team.start_order ?? '미배정'}</span>
          {team.start_order != null && '등'}
        </p>

        <div className="my-6 flex justify-center">
          <div className="animate-bounce text-7xl" aria-hidden>
            ⏳
          </div>
        </div>

        <p className="text-base font-bold text-text-dark">
          행사 시작을 기다리고 있어요
        </p>
        <p className="mt-1 text-sm text-text-dark/60 whitespace-pre-line">
          {waitingMessage}
        </p>

        {eventStartAt && (
          <p className="mt-4 text-xs text-text-dark/50">
            예정 시작: <span className="tabular-nums">{formatDateTime(eventStartAt)}</span>
          </p>
        )}
      </section>

      <div className="mt-4 rounded-2xl bg-white border border-text-dark/10 px-4 py-3">
        <p className="text-xs font-bold text-text-dark/50">팀 정보</p>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-text-dark/70">👥 팀원 수</span>
          <span className="font-bold text-text-dark tabular-nums">
            {team.member_count ?? 0}명
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-text-dark/70">📅 등록</span>
          <span className="font-bold text-text-dark tabular-nums">
            {formatDateTime(team.created_at)}
          </span>
        </div>
      </div>
    </>
  )
}

function CountdownBlock({
  secondsLeft,
  startOrder,
}: {
  secondsLeft: number
  startOrder: number | null
}) {
  return (
    <section
      className="relative rounded-3xl border-4 border-mint bg-white px-6 pt-10 pb-8 text-center"
      style={{ boxShadow: '0 10px 25px -5px rgba(134, 227, 161, 0.25)' }}
    >
      <div
        aria-hidden
        className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center"
      >
        <div className="w-24 h-6 rounded-lg bg-gradient-to-b from-gray-300 to-gray-400 shadow-md" />
        <div className="w-3 h-2 -mt-0.5 rounded-b-sm bg-gray-400" />
      </div>

      <p className="text-sm font-bold text-text-dark/60">⏱ 출발 순서 대기</p>
      <p className="mt-1 text-sm font-bold text-text-dark">
        출발 순서:{' '}
        <span className="text-orange-main tabular-nums">{startOrder ?? '?'}</span>
        {startOrder != null && '등'}
      </p>

      <div className="my-8">
        <p className="text-xs font-bold text-text-dark/50 uppercase tracking-wider">
          다음 차례까지
        </p>
        <p className="mt-2 text-7xl font-black text-mint tabular-nums">
          {formatCountdown(secondsLeft)}
        </p>
      </div>

      <p className="text-base font-bold text-text-dark">
        우리 팀 차례를 기다리는 중입니다
      </p>
      <p className="mt-1 text-sm text-text-dark/60">
        조금만 더 기다려주세요 🚀
      </p>
    </section>
  )
}

function GoBlock({ teamName, onGo }: { teamName: string; onGo: () => void }) {
  const goMessage = useText('lobby_go_message', '지금부터 미션 시작이에요 🚀')
  return (
    <section
      className="relative rounded-3xl border-4 border-orange-main bg-white px-6 pt-10 pb-8 text-center"
      style={{ boxShadow: 'var(--shadow-orange)' }}
    >
      <p className="text-sm font-bold text-text-dark/60">🟢 출발!</p>
      <h2 className="mt-1 text-xl font-black text-text-dark">{teamName} 팀</h2>

      <div className="my-8">
        <p className="text-8xl font-black text-orange-main animate-bounce">GO!</p>
      </div>

      <p className="text-base font-bold text-text-dark whitespace-pre-line">
        {goMessage}
      </p>
      <p className="mt-1 text-sm text-text-dark/60">
        잠시 후 미션 화면으로 이동합니다...
      </p>

      <button
        type="button"
        onClick={onGo}
        className="mt-6 w-full rounded-2xl bg-orange-main py-4 text-lg font-bold text-white hover:bg-orange-sub active:scale-[0.98] transition-all"
        style={{ boxShadow: 'var(--shadow-orange)' }}
      >
        🏃 지금 출발하기
      </button>
    </section>
  )
}

function ServiceEndedBlock() {
  return (
    <div className="my-auto py-16 text-center">
      <div className="text-6xl mb-4" aria-hidden>
        🔒
      </div>
      <h2 className="text-2xl font-black text-text-dark">
        행사가 종료되었습니다
      </h2>
      <p className="mt-2 text-base text-text-dark/60">
        참여해주셔서 감사합니다 🙏
      </p>
    </div>
  )
}
