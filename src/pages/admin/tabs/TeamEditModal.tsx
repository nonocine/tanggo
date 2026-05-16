import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { TeamRow } from '../../../lib/teamExcel'

const TEAM_NAME_MIN = 2
const TEAM_NAME_MAX = 12

interface Props {
  team: TeamRow
  onClose: () => void
  onSaved: () => void
}

export default function TeamEditModal({ team, onClose, onSaved }: Props) {
  const [name, setName] = useState(team.team_name)
  const [startOrder, setStartOrder] = useState<string>(
    team.start_order != null ? String(team.start_order) : '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const trimmedName = name.trim()
  const orderTrimmed = startOrder.trim()
  const orderNum = orderTrimmed ? Number(orderTrimmed) : null
  const orderValid =
    orderNum === null || (Number.isInteger(orderNum) && orderNum > 0)

  const nameValid =
    trimmedName.length >= TEAM_NAME_MIN &&
    trimmedName.length <= TEAM_NAME_MAX &&
    /[\p{L}\p{N}]/u.test(trimmedName)

  const canSubmit = !submitting && nameValid && orderValid

  async function handleSave() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    if (trimmedName !== team.team_name) {
      const { data, error: lookupError } = await supabase
        .from('tanggo_teams')
        .select('id')
        .eq('team_name', trimmedName)
        .neq('id', team.id)
        .maybeSingle()
      if (lookupError) {
        setError(lookupError.message)
        setSubmitting(false)
        return
      }
      if (data) {
        setError('이미 사용 중인 팀 이름이에요')
        setSubmitting(false)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('tanggo_teams')
      .update({ team_name: trimmedName, start_order: orderNum })
      .eq('id', team.id)

    if (updateError) {
      setError(updateError.message)
      setSubmitting(false)
      return
    }
    onSaved()
  }

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
          <h2 className="text-lg font-bold text-text-dark">✏ 팀 수정</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-dark/50 hover:bg-cream hover:text-text-dark text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-bold text-text-dark">팀 이름</label>
              <span className="text-xs font-medium text-text-dark/50">
                {trimmedName.length} / {TEAM_NAME_MAX}자
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value.slice(0, TEAM_NAME_MAX))
                if (error) setError(null)
              }}
              maxLength={TEAM_NAME_MAX}
              autoComplete="off"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-dark">
              출발 순서{' '}
              <span className="text-text-dark/40 font-medium">(비우면 미배정)</span>
            </label>
            <input
              type="number"
              min={1}
              value={startOrder}
              onChange={(e) => {
                setStartOrder(e.target.value)
                if (error) setError(null)
              }}
              placeholder="예: 3"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-[#E94B3C]">{error}</p>
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
            onClick={handleSave}
            disabled={!canSubmit}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              !canSubmit
                ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                : 'bg-orange-main text-white hover:bg-orange-sub'
            }`}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
