import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const POLL_INTERVAL_MS = 30_000

interface EventConfig {
  id: number
  event_start_at: string | null
  event_end_at: string | null
  time_limit_minutes: number
  start_interval_seconds: number
  announcement_title: string | null
  announcement_body: string | null
  announcement_updated_at: string | null
  service_ended: boolean
  target_teams: number | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface FormState {
  eventStartAt: string
  eventEndAt: string
  timeLimitMinutes: string
  startIntervalSeconds: string
  targetTeams: string
  announcementTitle: string
  announcementBody: string
}

function configToForm(c: EventConfig): FormState {
  return {
    eventStartAt: toLocalInput(c.event_start_at),
    eventEndAt: toLocalInput(c.event_end_at),
    timeLimitMinutes: String(c.time_limit_minutes ?? 90),
    startIntervalSeconds: String(c.start_interval_seconds ?? 60),
    targetTeams: c.target_teams != null ? String(c.target_teams) : '',
    announcementTitle: c.announcement_title ?? '',
    announcementBody: c.announcement_body ?? '',
  }
}

export default function EventSettings() {
  const [config, setConfig] = useState<EventConfig | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  const fetchConfig = useCallback(async (force = false) => {
    if (!force && dirtyRef.current) return
    const { data, error } = await supabase
      .from('tanggo_event_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (!data) {
      setError('event_config 행이 존재하지 않습니다 (id=1)')
      setLoading(false)
      return
    }
    const c = data as EventConfig
    setConfig(c)
    setForm(configToForm(c))
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchConfig(true)
    const t = setInterval(() => fetchConfig(false), POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchConfig])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const timingDirty =
    !!form &&
    !!config &&
    (form.eventStartAt !== toLocalInput(config.event_start_at) ||
      form.eventEndAt !== toLocalInput(config.event_end_at) ||
      Number(form.timeLimitMinutes) !== config.time_limit_minutes ||
      Number(form.startIntervalSeconds) !== config.start_interval_seconds)

  const targetDirty =
    !!form &&
    !!config &&
    form.targetTeams !==
      (config.target_teams != null ? String(config.target_teams) : '')

  const announcementDirty =
    !!form &&
    !!config &&
    (form.announcementTitle !== (config.announcement_title ?? '') ||
      form.announcementBody !== (config.announcement_body ?? ''))

  useEffect(() => {
    dirtyRef.current = timingDirty || targetDirty || announcementDirty
  }, [timingDirty, targetDirty, announcementDirty])

  async function updateConfig(
    section: string,
    patch: Partial<EventConfig>,
    successMsg: string,
  ) {
    setSavingSection(section)
    const { error } = await supabase
      .from('tanggo_event_config')
      .update(patch)
      .eq('id', 1)
    if (error) {
      setToast(`저장 실패: ${error.message}`)
      setSavingSection(null)
      return
    }
    setToast(successMsg)
    await fetchConfig(true)
    setSavingSection(null)
  }

  async function saveTiming() {
    if (!form) return
    const timeLimit = Number(form.timeLimitMinutes)
    const startInterval = Number(form.startIntervalSeconds)
    if (!Number.isFinite(timeLimit) || timeLimit < 1) {
      setToast('제한 시간은 1 이상이어야 해요')
      return
    }
    if (!Number.isFinite(startInterval) || startInterval < 0) {
      setToast('출발 간격은 0 이상이어야 해요')
      return
    }
    await updateConfig(
      'timing',
      {
        event_start_at: fromLocalInput(form.eventStartAt),
        event_end_at: fromLocalInput(form.eventEndAt),
        time_limit_minutes: timeLimit,
        start_interval_seconds: startInterval,
      },
      '⏱ 행사 시간을 저장했어요',
    )
  }

  async function saveTarget() {
    if (!form) return
    const n = form.targetTeams.trim() ? Number(form.targetTeams) : null
    if (n !== null && (!Number.isFinite(n) || n < 1)) {
      setToast('목표 팀 수는 1 이상이어야 해요')
      return
    }
    await updateConfig(
      'target',
      { target_teams: n },
      '🎯 목표 팀 수를 저장했어요',
    )
  }

  async function sendAnnouncement() {
    if (!form) return
    const title = form.announcementTitle.trim()
    const body = form.announcementBody.trim()
    if (!title && !body) {
      setToast('공지 제목 또는 본문을 입력해 주세요')
      return
    }
    await updateConfig(
      'announcement',
      {
        announcement_title: title || null,
        announcement_body: body || null,
        announcement_updated_at: new Date().toISOString(),
      },
      '📡 공지를 전송했어요',
    )
  }

  async function clearAnnouncement() {
    if (!window.confirm('공지를 삭제할까요?')) return
    await updateConfig(
      'announcement',
      {
        announcement_title: null,
        announcement_body: null,
        announcement_updated_at: new Date().toISOString(),
      },
      '🗑 공지를 삭제했어요',
    )
  }

  async function startEvent() {
    const ok = window.confirm(
      '지금 행사를 시작하시겠어요?\n모든 팀이 동시에 게임을 시작합니다.',
    )
    if (!ok) return
    setSavingSection('control')
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('tanggo_teams')
      .update({ started_at: nowIso })
      .is('started_at', null)
    if (error) {
      setToast(`행사 시작 실패: ${error.message}`)
    } else {
      setToast('🟢 행사를 시작했어요')
    }
    setSavingSection(null)
  }

  async function forceEndEvent() {
    const ok = window.confirm(
      '행사를 강제 종료하면 모든 팀의 게임이 중단됩니다.\n진행할까요?',
    )
    if (!ok) return
    setSavingSection('control')
    const nowIso = new Date().toISOString()
    const [configRes, teamsRes] = await Promise.all([
      supabase
        .from('tanggo_event_config')
        .update({ service_ended: true })
        .eq('id', 1),
      supabase
        .from('tanggo_teams')
        .update({ finished_at: nowIso })
        .not('started_at', 'is', null)
        .is('finished_at', null),
    ])
    if (configRes.error || teamsRes.error) {
      const msg = configRes.error?.message ?? teamsRes.error?.message
      setToast(`강제 종료 실패: ${msg}`)
    } else {
      setToast('🔴 행사를 강제 종료했어요')
      await fetchConfig(true)
    }
    setSavingSection(null)
  }

  async function toggleServiceEnded() {
    if (!config) return
    const next = !config.service_ended
    await updateConfig(
      'service',
      { service_ended: next },
      next
        ? '🔒 서비스를 종료 상태로 전환했어요'
        : '🔓 서비스를 정상 운영으로 전환했어요',
    )
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-text-dark/50">
        불러오는 중...
      </div>
    )
  }
  if (error || !config || !form) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold text-[#E94B3C]">
          {error ?? '설정을 불러올 수 없어요'}
        </p>
        <button
          type="button"
          onClick={() => fetchConfig(true)}
          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      {/* 섹션 1: 행사 시간 */}
      <SectionCard
        icon="📅"
        title="행사 시간"
        dirty={timingDirty}
        action={
          <button
            type="button"
            onClick={saveTiming}
            disabled={!timingDirty || savingSection === 'timing'}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              !timingDirty
                ? 'bg-text-dark/10 text-text-dark/40 cursor-not-allowed'
                : 'bg-orange-main text-white hover:bg-orange-sub'
            }`}
          >
            {savingSection === 'timing' ? '저장 중...' : '저장'}
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="행사 시작 시각">
            <input
              type="datetime-local"
              value={form.eventStartAt}
              onChange={(e) => set('eventStartAt', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="행사 종료 시각">
            <input
              type="datetime-local"
              value={form.eventEndAt}
              onChange={(e) => set('eventEndAt', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="제한 시간 (분)">
            <input
              type="number"
              min={1}
              value={form.timeLimitMinutes}
              onChange={(e) => set('timeLimitMinutes', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="출발 간격 (초)"
            help="팀과 팀 사이 출발 텀"
          >
            <input
              type="number"
              min={0}
              value={form.startIntervalSeconds}
              onChange={(e) => set('startIntervalSeconds', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </SectionCard>

      {/* 섹션 2: 목표 팀 수 */}
      <SectionCard
        icon="🎯"
        title="목표 팀 수"
        dirty={targetDirty}
        action={
          <button
            type="button"
            onClick={saveTarget}
            disabled={!targetDirty || savingSection === 'target'}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              !targetDirty
                ? 'bg-text-dark/10 text-text-dark/40 cursor-not-allowed'
                : 'bg-orange-main text-white hover:bg-orange-sub'
            }`}
          >
            {savingSection === 'target' ? '저장 중...' : '저장'}
          </button>
        }
      >
        <Field
          label="기대 팀 수"
          help="보고서 달성률 계산에 사용됩니다 (예: 20팀)"
        >
          <input
            type="number"
            min={1}
            value={form.targetTeams}
            onChange={(e) => set('targetTeams', e.target.value)}
            placeholder="예: 20"
            className={`${inputClass} max-w-[200px]`}
          />
        </Field>
      </SectionCard>

      {/* 섹션 3: 공지사항 */}
      <SectionCard
        icon="📢"
        title="공지사항"
        dirty={announcementDirty}
        tone="yellow"
        subtitle="공지는 모든 참가자 폰에 즉시 표시됩니다"
      >
        <Field label="제목">
          <input
            type="text"
            value={form.announcementTitle}
            onChange={(e) => set('announcementTitle', e.target.value)}
            placeholder="예: 미션 #7 위치 변경 안내"
            className={inputClass}
          />
        </Field>
        <div className="mt-3">
          <Field label="본문">
            <textarea
              value={form.announcementBody}
              onChange={(e) => set('announcementBody', e.target.value)}
              rows={3}
              placeholder="공지 본문"
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
        {config.announcement_updated_at && (
          <p className="mt-2 text-xs text-text-dark/50">
            마지막 발송:{' '}
            <span className="tabular-nums">
              {formatDateTime(config.announcement_updated_at)}
            </span>
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={clearAnnouncement}
            disabled={savingSection === 'announcement'}
            className="px-4 py-2 rounded-xl border-2 border-text-dark/10 text-sm font-bold text-text-dark/60 hover:border-[#E94B3C] hover:text-[#E94B3C] disabled:opacity-50"
          >
            🗑 공지 삭제
          </button>
          <button
            type="button"
            onClick={sendAnnouncement}
            disabled={savingSection === 'announcement'}
            className="px-4 py-2 rounded-xl bg-orange-main text-white text-sm font-bold hover:bg-orange-sub disabled:opacity-50"
          >
            📡 즉시 전송
          </button>
        </div>
      </SectionCard>

      {/* 섹션 4: 행사 제어 */}
      <SectionCard icon="🚦" title="행사 제어" tone="red">
        <div className="flex flex-col md:flex-row gap-2">
          <button
            type="button"
            onClick={startEvent}
            disabled={savingSection === 'control'}
            className="flex-1 px-4 py-4 rounded-2xl bg-mint text-text-dark text-base font-black hover:bg-[#6FD491] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            🟢 행사 시작
          </button>
          <button
            type="button"
            disabled
            title="다음 단계에서 구현 예정"
            className="flex-1 px-4 py-4 rounded-2xl bg-text-dark/10 text-text-dark/40 text-base font-black cursor-not-allowed"
          >
            ⏸ 일시정지 (준비 중)
          </button>
          <button
            type="button"
            onClick={forceEndEvent}
            disabled={savingSection === 'control'}
            className="flex-1 px-4 py-4 rounded-2xl bg-[#E94B3C] text-white text-base font-black hover:bg-[#d83d2f] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            🔴 강제 종료
          </button>
        </div>
      </SectionCard>

      {/* 섹션 5: 서비스 종료 토글 */}
      <SectionCard icon="🔒" title="서비스 종료 토글">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-text-dark">
              {config.service_ended ? '🔒 서비스 종료 상태' : '🔓 정상 운영 중'}
            </p>
            <p className="mt-1 text-xs text-text-dark/60">
              {config.service_ended
                ? '참가자 화면이 차단됩니다'
                : '참가자가 게임에 정상 접근할 수 있어요'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.service_ended}
            onClick={toggleServiceEnded}
            disabled={savingSection === 'service'}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              config.service_ended ? 'bg-[#E94B3C]' : 'bg-mint'
            }`}
          >
            <span
              className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition-transform ${
                config.service_ended ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </SectionCard>

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

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20'

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-xs font-bold text-text-dark">{label}</label>
      <div className="mt-1.5">{children}</div>
      {help && <p className="mt-1 text-[11px] text-text-dark/50">{help}</p>}
    </div>
  )
}

function SectionCard({
  icon,
  title,
  subtitle,
  dirty,
  tone,
  action,
  children,
}: {
  icon: string
  title: string
  subtitle?: string
  dirty?: boolean
  tone?: 'yellow' | 'red'
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const toneCls =
    tone === 'yellow'
      ? 'bg-[#FFFBEA] border-[#F4C430]/40'
      : tone === 'red'
        ? 'bg-[#FFF1ED] border-[#E94B3C]/30'
        : 'bg-white border-text-dark/10'

  return (
    <section
      className={`rounded-2xl border-2 ${toneCls} px-5 py-5`}
      style={{ boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)' }}
    >
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            {icon}
          </span>
          <h2 className="text-base font-bold text-text-dark">{title}</h2>
          {dirty && (
            <span
              aria-label="저장되지 않은 변경사항"
              className="w-2 h-2 rounded-full bg-[#E94B3C]"
            />
          )}
        </div>
        {action}
      </header>
      {subtitle && (
        <p className="-mt-2 mb-4 text-xs text-text-dark/60">{subtitle}</p>
      )}
      {children}
    </section>
  )
}
