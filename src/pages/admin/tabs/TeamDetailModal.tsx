import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { TeamRow, MemberRow } from '../../../lib/teamExcel'
import { teamStatusLabel } from '../../../lib/teamExcel'

interface Props {
  team: TeamRow
  onClose: () => void
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TeamDetailModal({ team, onClose }: Props) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('tanggo_team_members')
      .select('id, team_id, name, created_at')
      .eq('team_id', team.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setMembers([])
        } else {
          setMembers((data ?? []) as MemberRow[])
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [team.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const status = teamStatusLabel(team)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl border-4 border-orange-main my-8"
        style={{ boxShadow: 'var(--shadow-orange)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-text-dark/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-dark">
            👁 팀 상세 정보
          </h2>
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
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-bold text-text-dark/50">팀 이름</p>
              <p className="mt-0.5 font-semibold text-text-dark">{team.team_name}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-text-dark/50">출발 순서</p>
              <p className="mt-0.5 font-semibold text-text-dark tabular-nums">
                {team.start_order ?? '미배정'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-text-dark/50">상태</p>
              <p className="mt-0.5 font-semibold text-text-dark">{status}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-text-dark/50">팀원 수</p>
              <p className="mt-0.5 font-semibold text-text-dark tabular-nums">
                {team.member_count ?? 0}명
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-text-dark/50">시작 시각</p>
              <p className="mt-0.5 font-semibold text-text-dark">
                {formatDateTime(team.started_at)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-text-dark/50">완료 시각</p>
              <p className="mt-0.5 font-semibold text-text-dark">
                {formatDateTime(team.finished_at)}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-bold text-text-dark/50">팀원 명단</p>
            <div className="mt-2 rounded-xl border border-text-dark/10 overflow-hidden">
              {loading ? (
                <div className="py-6 text-center text-xs text-text-dark/50">
                  불러오는 중...
                </div>
              ) : error ? (
                <div className="py-6 text-center text-xs text-[#E94B3C]">
                  {error}
                </div>
              ) : members.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-dark/40">
                  등록된 팀원이 없어요
                </div>
              ) : (
                <ul className="divide-y divide-text-dark/5">
                  {members.map((m, idx) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <span
                        aria-hidden
                        className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-orange-sub text-white text-xs font-bold tabular-nums"
                      >
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-text-dark">{m.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-text-dark/10 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-dark/70 hover:bg-cream"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
