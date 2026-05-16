import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const POLL_INTERVAL_MS = 5000
const TICK_INTERVAL_MS = 30_000

interface TeamRow {
  id: string
  team_name: string
  start_order: number | null
  member_count: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

interface AnswerRow {
  team_id: string
  is_correct: boolean
  answered_at: string | null
}

interface TeamProgress extends TeamRow {
  correct_count: number
  last_activity: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatHM(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function relTime(iso: string | null, now: Date): string {
  if (!iso) return '—'
  const diffSec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000)
  if (diffSec < 0) return '방금 전'
  if (diffSec < 60) return `${diffSec}초 전`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

function progressBg(pct: number): string {
  if (pct >= 100) return 'bg-yellow-accent'
  if (pct >= 60) return 'bg-mint'
  if (pct >= 30) return 'bg-[#F4C430]'
  return 'bg-[#E94B3C]'
}

function activityColor(iso: string | null, now: Date): string {
  if (!iso) return 'text-text-dark/40'
  const diffMin = (now.getTime() - new Date(iso).getTime()) / 60000
  if (diffMin <= 1) return 'text-[#4CAF7F]'
  if (diffMin <= 5) return 'text-[#A88300]'
  return 'text-text-dark/40'
}

function statusBadge(t: TeamRow) {
  if (t.finished_at) return { label: '🏁 완료', cls: 'bg-yellow-accent/30 text-[#8a6f00]' }
  if (t.started_at) return { label: '🟢 진행 중', cls: 'bg-mint/25 text-[#2C7846]' }
  return { label: '🟡 시작 전', cls: 'bg-[#F4C430]/20 text-[#A88300]' }
}

export default function GameProgress() {
  const [teams, setTeams] = useState<TeamProgress[]>([])
  const [totalQuizzes, setTotalQuizzes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  const fetchAll = useCallback(async () => {
    const [teamsRes, answersRes, countRes] = await Promise.all([
      supabase
        .from('tanggo_teams')
        .select(
          'id, team_name, start_order, member_count, started_at, finished_at, created_at',
        ),
      supabase
        .from('tanggo_answers')
        .select('team_id, is_correct, answered_at')
        .eq('is_correct', true),
      supabase
        .from('tanggo_quizzes')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
    ])

    if (teamsRes.error || answersRes.error || countRes.error) {
      const msg =
        teamsRes.error?.message ??
        answersRes.error?.message ??
        countRes.error?.message
      setError(msg ?? '데이터 로딩 실패')
      setLoading(false)
      return
    }

    const teamRows = (teamsRes.data ?? []) as TeamRow[]
    const answerRows = (answersRes.data ?? []) as AnswerRow[]
    const total = countRes.count ?? 0

    const byTeam = new Map<string, { correct: number; last: string | null }>()
    for (const a of answerRows) {
      const cur = byTeam.get(a.team_id) ?? { correct: 0, last: null }
      cur.correct += 1
      if (a.answered_at && (!cur.last || a.answered_at > cur.last)) {
        cur.last = a.answered_at
      }
      byTeam.set(a.team_id, cur)
    }

    const progress: TeamProgress[] = teamRows.map((t) => ({
      ...t,
      correct_count: byTeam.get(t.id)?.correct ?? 0,
      last_activity: byTeam.get(t.id)?.last ?? null,
    }))

    progress.sort((a, b) => {
      if (b.correct_count !== a.correct_count) {
        return b.correct_count - a.correct_count
      }
      const aTime = a.finished_at ?? a.last_activity ?? '￿'
      const bTime = b.finished_at ?? b.last_activity ?? '￿'
      return aTime.localeCompare(bTime)
    })

    setTeams(progress)
    setTotalQuizzes(total)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const stats = useMemo(() => {
    const totalTeams = teams.length
    let pendingTeams = 0
    let playingTeams = 0
    let finishedTeams = 0
    for (const t of teams) {
      if (t.finished_at) finishedTeams++
      else if (t.started_at) playingTeams++
      else pendingTeams++
    }
    const avgCorrect =
      totalTeams === 0
        ? 0
        : teams.reduce((s, t) => s + t.correct_count, 0) / totalTeams
    const avgPct =
      totalQuizzes === 0 ? 0 : Math.round((avgCorrect / totalQuizzes) * 100)
    return {
      totalTeams,
      pendingTeams,
      playingTeams,
      finishedTeams,
      avgCorrect: Math.round(avgCorrect * 10) / 10,
      avgPct,
    }
  }, [teams, totalQuizzes])

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-text-dark/50">
        불러오는 중...
      </div>
    )
  }

  if (error) {
    return (
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
    )
  }

  const allPending = teams.length > 0 && stats.pendingTeams === teams.length

  return (
    <div className="flex flex-col gap-4">
      {/* 통계 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <StatCard icon="📋" label="전체 팀" value={`${stats.totalTeams}팀`} />
        <StatCard
          icon="🟡"
          label="시작 전"
          value={`${stats.pendingTeams}팀`}
          tone="yellow"
        />
        <StatCard
          icon="🟢"
          label="진행 중"
          value={`${stats.playingTeams}팀`}
          tone="green"
        />
        <StatCard
          icon="🏁"
          label="완료"
          value={`${stats.finishedTeams}팀`}
          tone="gold"
        />
      </div>

      {/* 평균 진행률 */}
      <div className="rounded-2xl bg-white border border-text-dark/10 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-bold text-text-dark">평균 진행률</p>
          <p className="text-sm font-bold text-text-dark/70 tabular-nums">
            <span className="text-orange-main text-lg">{stats.avgCorrect}</span>
            <span className="text-text-dark/40"> / {totalQuizzes}</span>
            <span className="ml-2 text-text-dark">({stats.avgPct}%)</span>
          </p>
        </div>
        <div className="h-3 rounded-full bg-text-dark/10 overflow-hidden">
          <div
            className={`h-full transition-all ${progressBg(stats.avgPct)}`}
            style={{ width: `${Math.min(stats.avgPct, 100)}%` }}
          />
        </div>
      </div>

      {/* 팀 목록 */}
      <div className="rounded-2xl bg-white border border-text-dark/10 overflow-hidden">
        {teams.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              🌿
            </div>
            <p className="text-sm font-bold text-text-dark/60">
              등록된 팀이 없습니다
            </p>
          </div>
        ) : allPending ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              🟡
            </div>
            <p className="text-sm font-bold text-text-dark/60">
              모든 팀이 시작 대기 중
            </p>
            <p className="mt-1 text-xs text-text-dark/50">
              "행사 설정" 탭에서 행사를 시작하세요
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-text-dark/70">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">순위</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">팀 이름</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">상태</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">완료</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap min-w-[180px]">진행률</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">시작</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">마지막 활동</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, idx) => {
                  const badge = statusBadge(t)
                  const pct =
                    totalQuizzes === 0
                      ? 0
                      : Math.round((t.correct_count / totalQuizzes) * 100)
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-text-dark/5 hover:bg-cream/40"
                    >
                      <td className="px-3 py-2.5 font-black text-text-dark tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-text-dark whitespace-nowrap">
                        {t.team_name}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                        <span className="font-bold text-text-dark">
                          {t.correct_count}
                        </span>
                        <span className="text-text-dark/40"> / {totalQuizzes}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 rounded-full bg-text-dark/10 overflow-hidden">
                            <div
                              className={`h-full transition-all ${progressBg(pct)}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-text-dark/70 tabular-nums w-10">
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-text-dark/60 tabular-nums whitespace-nowrap">
                        {formatHM(t.started_at)}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-semibold tabular-nums whitespace-nowrap ${activityColor(t.last_activity, now)}`}
                      >
                        {relTime(t.last_activity, now)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: string
  label: string
  value: string
  tone?: 'yellow' | 'green' | 'gold'
}) {
  const toneCls =
    tone === 'green'
      ? 'border-mint/40 bg-mint/5'
      : tone === 'yellow'
        ? 'border-[#F4C430]/40 bg-[#F4C430]/5'
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
      </p>
    </div>
  )
}
