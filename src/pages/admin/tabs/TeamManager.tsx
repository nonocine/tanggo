import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { TeamRow, MemberRow } from '../../../lib/teamExcel'
import { exportTeamsToExcel } from '../../../lib/teamExcel'
import { todayStamp } from '../../../lib/quizExcel'
import { SEASON_CONFIG } from '../../../config/seasonConfig'
import TeamDetailModal from './TeamDetailModal'
import TeamEditModal from './TeamEditModal'

const POLL_INTERVAL_MS = 5000

type Modal =
  | null
  | { kind: 'detail'; team: TeamRow }
  | { kind: 'edit'; team: TeamRow }

function statusBadge(t: TeamRow) {
  if (t.finished_at) return { label: '🏁 완료', cls: 'bg-gray-100 text-gray-700' }
  if (t.started_at) return { label: '🟢 진행 중', cls: 'bg-[#4CAF7F]/15 text-[#4CAF7F]' }
  return { label: '🟡 시작 전', cls: 'bg-[#F4C430]/15 text-[#A88300]' }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TeamManager() {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const fetchTeams = useCallback(async () => {
    const { data, error } = await supabase
      .from('tanggo_teams')
      .select(
        'id, team_name, start_order, member_count, started_at, finished_at, created_at',
      )
      .order('start_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (error) {
      setError(error.message)
      setTeams([])
    } else {
      setError(null)
      setTeams((data ?? []) as TeamRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTeams()
    const t = setInterval(fetchTeams, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchTeams])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const stats = useMemo(() => {
    const totalTeams = teams.length
    const totalMembers = teams.reduce((sum, t) => sum + (t.member_count ?? 0), 0)
    const assigned = teams.filter((t) => t.start_order != null).length
    return { totalTeams, totalMembers, assigned }
  }, [teams])

  async function handleRandomize() {
    if (teams.length === 0) {
      setToast('배정할 팀이 없어요')
      return
    }
    const ok = window.confirm(
      '기존 출발 순서가 모두 새로 배정됩니다. 진행할까요?',
    )
    if (!ok) return

    setBusy(true)
    const shuffled = [...teams]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const results = await Promise.all(
      shuffled.map((t, idx) =>
        supabase
          .from('tanggo_teams')
          .update({ start_order: idx + 1 })
          .eq('id', t.id),
      ),
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      setToast(`배정 실패: ${failed.error?.message}`)
    } else {
      setToast(`${shuffled.length}개 팀의 출발 순서를 무작위 배정했어요`)
    }
    await fetchTeams()
    setBusy(false)
  }

  async function handleDeleteTest() {
    const testTeams = teams.filter((t) => t.team_name.startsWith('테스트'))
    if (testTeams.length === 0) {
      setToast('"테스트"로 시작하는 팀이 없어요')
      return
    }
    const ok = window.confirm(
      `"테스트"로 시작하는 팀 ${testTeams.length}개를 모두 삭제할까요?`,
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase
      .from('tanggo_teams')
      .delete()
      .ilike('team_name', '테스트%')
    if (error) {
      setToast(`삭제 실패: ${error.message}`)
    } else {
      setToast(`${testTeams.length}개 테스트 팀을 삭제했어요`)
    }
    await fetchTeams()
    setBusy(false)
  }

  async function handleExport() {
    if (teams.length === 0) {
      setToast('내보낼 팀이 없어요')
      return
    }
    setBusy(true)
    const { data: allMembers, error: memErr } = await supabase
      .from('tanggo_team_members')
      .select('id, team_id, name, created_at')
      .order('created_at', { ascending: true })
    if (memErr) {
      setToast(`팀원 조회 실패: ${memErr.message}`)
      setBusy(false)
      return
    }
    const byTeam = new Map<string, MemberRow[]>()
    for (const m of (allMembers ?? []) as MemberRow[]) {
      const arr = byTeam.get(m.team_id) ?? []
      arr.push(m)
      byTeam.set(m.team_id, arr)
    }
    const cleanName = SEASON_CONFIG.seasonName.replace(/\s/g, '')
    exportTeamsToExcel(teams, byTeam, `${cleanName}_팀명단_${todayStamp()}.xlsx`)
    setBusy(false)
  }

  async function handleDelete(t: TeamRow) {
    const ok = window.confirm(`"${t.team_name}" 팀을 삭제할까요?\n팀원 정보도 함께 삭제됩니다.`)
    if (!ok) return
    const { error } = await supabase.from('tanggo_teams').delete().eq('id', t.id)
    if (error) {
      setToast(`삭제 실패: ${error.message}`)
      return
    }
    setTeams((prev) => prev.filter((x) => x.id !== t.id))
    setToast(`"${t.team_name}" 팀을 삭제했어요`)
  }

  return (
    <div>
      {/* 상단 액션 바 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2 lg:gap-3 lg:flex">
          <Stat icon="📋" label="등록된 팀" value={`${stats.totalTeams}개`} />
          <Stat icon="👥" label="총 팀원" value={`${stats.totalMembers}명`} />
          <Stat icon="🎯" label="순서 배정" value={`${stats.assigned}팀`} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRandomize}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-orange-main text-white text-sm font-bold hover:bg-orange-sub disabled:opacity-50"
            style={{ boxShadow: 'var(--shadow-orange-sm)' }}
          >
            🎲 출발 순서 무작위 배정
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/80 hover:border-orange-main hover:text-orange-main bg-white disabled:opacity-50"
          >
            📤 명단 엑셀
          </button>
          <button
            type="button"
            onClick={handleDeleteTest}
            disabled={busy}
            className="px-3 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/60 hover:border-[#E94B3C] hover:text-[#E94B3C] bg-white disabled:opacity-50"
          >
            🗑 테스트 팀 삭제
          </button>
        </div>
      </div>

      {/* 테이블 */}
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
              onClick={fetchTeams}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
            >
              다시 시도
            </button>
          </div>
        ) : teams.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3" aria-hidden>
              📭
            </div>
            <p className="text-sm font-bold text-text-dark/70">
              아직 등록된 팀이 없어요
            </p>
            <p className="mt-1 text-xs text-text-dark/50">
              참가자들이 "팀 만들기"로 등록하면 여기에 표시돼요
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-text-dark/70">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">출발 순서</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">팀 이름</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">팀원 수</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">상태</th>
                  <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">등록 시각</th>
                  <th className="px-3 py-2.5 text-right font-bold whitespace-nowrap">작업</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const badge = statusBadge(t)
                  return (
                    <tr key={t.id} className="border-t border-text-dark/5 hover:bg-cream/40">
                      <td className="px-3 py-2.5 tabular-nums font-bold text-text-dark/80">
                        {t.start_order ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-text-dark whitespace-nowrap">
                        {t.team_name}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-text-dark/70">
                        {t.member_count ?? 0}명
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-dark/60 tabular-nums whitespace-nowrap">
                        {formatDateTime(t.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setModal({ kind: 'detail', team: t })}
                          aria-label="상세 보기"
                          className="px-2 py-1 rounded-lg text-text-dark/60 hover:bg-orange-main/10 hover:text-orange-main"
                        >
                          👁
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ kind: 'edit', team: t })}
                          aria-label="수정"
                          className="ml-1 px-2 py-1 rounded-lg text-text-dark/60 hover:bg-orange-main/10 hover:text-orange-main"
                        >
                          ✏
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          aria-label="삭제"
                          className="ml-1 px-2 py-1 rounded-lg text-text-dark/60 hover:bg-[#E94B3C]/10 hover:text-[#E94B3C]"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.kind === 'detail' && (
        <TeamDetailModal team={modal.team} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'edit' && (
        <TeamEditModal
          team={modal.team}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setToast('팀 정보를 수정했어요')
            fetchTeams()
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

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 rounded-xl bg-white border border-text-dark/10 min-w-[110px]">
      <p className="text-[11px] font-bold text-text-dark/50">
        <span className="mr-1" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-0.5 text-lg font-black text-text-dark tabular-nums">{value}</p>
    </div>
  )
}
