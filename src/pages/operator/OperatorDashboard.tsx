import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SEASON_CONFIG } from '../../config/seasonConfig'
import { OPERATOR_AUTH_KEY } from '../../components/OperatorProtected'

const POLL_INTERVAL_MS = 5000
const PROCESSED_WINDOW_MS = 30 * 60 * 1000 // 30분

interface MissionRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  processed_at: string | null
  processed_by: string | null
  note: string | null
  team_id: string
  quiz_id: string
  team: { team_name: string } | null
  quiz: {
    order_num: number
    question: string
    location_hint: string | null
  } | null
}

const JOIN_SELECT = `
  id, status, requested_at, processed_at, processed_by, note,
  team_id, quiz_id,
  team:tanggo_teams!inner(team_name),
  quiz:tanggo_quizzes!inner(order_num, question, location_hint)
`.trim()

type TabKey = 'pending' | 'processed'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatHMS(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatHM(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function relTime(iso: string, now: Date): string {
  const diffSec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000)
  if (diffSec < 0) return '방금 전'
  if (diffSec < 30) return '방금 전'
  if (diffSec < 60) return `${diffSec}초 전`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return `${day}일 전`
}

export default function OperatorDashboard() {
  const navigate = useNavigate()

  const [now, setNow] = useState(new Date())
  const [pending, setPending] = useState<MissionRequest[]>([])
  const [processed, setProcessed] = useState<MissionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('pending')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [rejectFor, setRejectFor] = useState<MissionRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // 실시간 시계
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - PROCESSED_WINDOW_MS).toISOString()
    const [pendingRes, processedRes] = await Promise.all([
      supabase
        .from('tanggo_mission_requests')
        .select(JOIN_SELECT)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true }),
      supabase
        .from('tanggo_mission_requests')
        .select(JOIN_SELECT)
        .in('status', ['approved', 'rejected'])
        .gte('processed_at', since)
        .order('processed_at', { ascending: false }),
    ])

    if (pendingRes.error) {
      setError(pendingRes.error.message)
    } else if (processedRes.error) {
      setError(processedRes.error.message)
    } else {
      setError(null)
      setPending((pendingRes.data ?? []) as unknown as MissionRequest[])
      setProcessed((processedRes.data ?? []) as unknown as MissionRequest[])
    }
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

  function handleLogout() {
    localStorage.removeItem(OPERATOR_AUTH_KEY)
    navigate('/', { replace: true })
  }

  function markBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function handleApprove(req: MissionRequest) {
    if (busyIds.has(req.id)) return
    markBusy(req.id, true)
    // optimistic remove
    setPending((prev) => prev.filter((r) => r.id !== req.id))

    const nowIso = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('tanggo_mission_requests')
      .update({ status: 'approved', processed_at: nowIso })
      .eq('id', req.id)

    if (updateErr) {
      setToast(`승인 실패: ${updateErr.message}`)
      markBusy(req.id, false)
      fetchAll()
      return
    }

    const { error: answerErr } = await supabase
      .from('tanggo_answers')
      .upsert(
        {
          team_id: req.team_id,
          quiz_id: req.quiz_id,
          submitted: '[현장미션승인]',
          is_correct: true,
          answered_at: nowIso,
        },
        { onConflict: 'team_id,quiz_id' },
      )

    if (answerErr) {
      setToast(`답안 저장 실패: ${answerErr.message}`)
    } else {
      const teamName = req.team?.team_name ?? '팀'
      const orderNum = req.quiz?.order_num ?? '?'
      setToast(`✅ ${teamName} - 미션 ${orderNum} 승인됨`)
    }

    markBusy(req.id, false)
    fetchAll()
  }

  function openReject(req: MissionRequest) {
    setRejectFor(req)
    setRejectReason('')
  }

  async function confirmReject() {
    if (!rejectFor) return
    const req = rejectFor
    if (busyIds.has(req.id)) return
    markBusy(req.id, true)
    setRejectFor(null)
    // optimistic remove
    setPending((prev) => prev.filter((r) => r.id !== req.id))

    const { error: updateErr } = await supabase
      .from('tanggo_mission_requests')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        note: rejectReason.trim() || null,
      })
      .eq('id', req.id)

    if (updateErr) {
      setToast(`거절 실패: ${updateErr.message}`)
    } else {
      const teamName = req.team?.team_name ?? '팀'
      const orderNum = req.quiz?.order_num ?? '?'
      setToast(`❌ ${teamName} - 미션 ${orderNum} 거절됨`)
    }

    markBusy(req.id, false)
    fetchAll()
  }

  const list = tab === 'pending' ? pending : processed

  return (
    <div className="min-h-screen bg-cream">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white border-b border-text-dark/10">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0" aria-hidden>
              ✋
            </span>
            <h1 className="text-sm md:text-base font-bold text-text-dark truncate">
              운영자
              <span className="text-text-dark/40 mx-1.5">·</span>
              <span className="text-mint">{SEASON_CONFIG.seasonName}</span>
            </h1>
          </div>
          <div className="hidden sm:block text-lg font-black tabular-nums text-text-dark/80">
            {formatHMS(now)}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 px-3 py-1.5 text-xs md:text-sm font-bold text-text-dark/70 rounded-lg border border-text-dark/15 hover:bg-cream hover:text-text-dark transition-colors"
          >
            로그아웃
          </button>
        </div>
        <div className="sm:hidden text-center pb-2 text-base font-black tabular-nums text-text-dark/80">
          {formatHMS(now)}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {/* 대기 카운터 카드 */}
        <section
          className={`rounded-3xl border-4 px-6 py-6 text-center ${
            pending.length > 0
              ? 'border-orange-main bg-white'
              : 'border-text-dark/10 bg-white'
          }`}
          style={
            pending.length > 0
              ? { boxShadow: 'var(--shadow-orange)' }
              : undefined
          }
        >
          <p className="text-sm font-bold text-text-dark/70">
            🔔 대기 중인 승인 요청
          </p>
          {pending.length === 0 ? (
            <p className="mt-3 text-base font-semibold text-text-dark/40">
              🌿 대기 중인 요청이 없습니다
            </p>
          ) : (
            <p className="mt-2 text-5xl font-black text-orange-main tabular-nums">
              {pending.length}
              <span className="text-xl text-text-dark/60 ml-1">건</span>
            </p>
          )}
        </section>

        {/* 탭 */}
        <nav className="mt-5 flex gap-1 border-b border-text-dark/10">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === 'pending'
                ? 'border-orange-main text-orange-main'
                : 'border-transparent text-text-dark/60 hover:text-text-dark'
            }`}
          >
            ⏳ 대기 중 ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('processed')}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === 'processed'
                ? 'border-orange-main text-orange-main'
                : 'border-transparent text-text-dark/60 hover:text-text-dark'
            }`}
          >
            ✓ 처리 완료
          </button>
        </nav>

        {/* 목록 */}
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
          ) : list.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3" aria-hidden>
                {tab === 'pending' ? '🌿' : '📭'}
              </div>
              <p className="text-sm font-bold text-text-dark/60">
                {tab === 'pending'
                  ? '대기 중인 요청이 없습니다'
                  : '최근 30분 내 처리된 요청이 없습니다'}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {list.map((r) =>
                tab === 'pending' ? (
                  <PendingCard
                    key={r.id}
                    req={r}
                    now={now}
                    busy={busyIds.has(r.id)}
                    onApprove={() => handleApprove(r)}
                    onReject={() => openReject(r)}
                  />
                ) : (
                  <ProcessedCard key={r.id} req={r} now={now} />
                ),
              )}
            </ul>
          )}
        </div>
      </main>

      {/* 거절 사유 모달 */}
      {rejectFor && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4"
          onClick={() => setRejectFor(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl border-4 border-[#E94B3C]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-3 border-b border-text-dark/10 flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-dark">❌ 거절 사유</h2>
              <button
                type="button"
                onClick={() => setRejectFor(null)}
                aria-label="닫기"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-dark/50 hover:bg-cream hover:text-text-dark text-xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-text-dark/70">
                <span className="font-bold text-text-dark">
                  {rejectFor.team?.team_name}
                </span>{' '}
                · 미션{' '}
                <span className="tabular-nums">{rejectFor.quiz?.order_num}</span>
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="사유 입력 (선택)"
                className="mt-3 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-[#E94B3C] focus:ring-2 focus:ring-[#E94B3C]/20 resize-y"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-text-dark/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectFor(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-dark/70 hover:bg-cream"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmReject}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#E94B3C] text-white hover:bg-[#d83d2f]"
              >
                거절하기
              </button>
            </div>
          </div>
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

function PendingCard({
  req,
  now,
  busy,
  onApprove,
  onReject,
}: {
  req: MissionRequest
  now: Date
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <li
      className="rounded-2xl border-4 border-orange-main bg-white p-4 animate-slide-in-down"
      style={{ boxShadow: 'var(--shadow-orange-sm)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-text-dark">
            <span className="text-orange-main">[{req.team?.team_name}]</span> 팀
          </p>
          <p className="mt-1 text-sm font-semibold text-text-dark">
            미션{' '}
            <span className="tabular-nums">#{req.quiz?.order_num}</span> ·{' '}
            {req.quiz?.question}
          </p>
          {req.quiz?.location_hint && (
            <p className="mt-1 text-xs text-text-dark/60">
              📍 {req.quiz.location_hint}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold text-text-dark/40 tabular-nums">
            {formatHM(req.requested_at)}
          </p>
          <p className="text-[11px] text-text-dark/40">
            {relTime(req.requested_at, now)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="flex-1 py-3 rounded-xl bg-mint text-text-dark text-base font-black hover:bg-[#6FD491] active:scale-[0.98] transition-all disabled:opacity-50"
        >
          ✅ 승인
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="flex-1 py-3 rounded-xl bg-[#E94B3C] text-white text-base font-black hover:bg-[#d83d2f] active:scale-[0.98] transition-all disabled:opacity-50"
        >
          ❌ 거절
        </button>
      </div>
    </li>
  )
}

function ProcessedCard({ req, now }: { req: MissionRequest; now: Date }) {
  const approved = req.status === 'approved'
  return (
    <li className="rounded-2xl border border-text-dark/10 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-dark">
            {req.team?.team_name}
            <span className="text-text-dark/40 mx-1.5">·</span>
            <span className="font-medium text-text-dark/70">
              미션{' '}
              <span className="tabular-nums">#{req.quiz?.order_num}</span>
            </span>
          </p>
          {!approved && req.note && (
            <p className="mt-1 text-xs text-text-dark/60 italic">
              "{req.note}"
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
              approved
                ? 'bg-mint-light text-[#2C7846]'
                : 'bg-[#E94B3C]/15 text-[#E94B3C]'
            }`}
          >
            {approved ? '✅ 승인' : '❌ 거절'}
          </span>
          <p className="mt-1 text-[11px] text-text-dark/40 tabular-nums">
            {formatHM(req.processed_at)} ·{' '}
            {req.processed_at ? relTime(req.processed_at, now) : ''}
          </p>
        </div>
      </div>
    </li>
  )
}
