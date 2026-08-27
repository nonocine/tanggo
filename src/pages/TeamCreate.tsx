import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'

const TEAM_NAME_MIN = 2
const TEAM_NAME_MAX = 12
const MEMBER_NAME_MAX = 10
const MEMBER_MIN = 3
const MEMBER_MAX = 20

type DupStatus = 'idle' | 'checking' | 'available' | 'duplicate' | 'error'

interface Member {
  id: number
  name: string
}

function validateTeamName(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length < TEAM_NAME_MIN) return `${TEAM_NAME_MIN}자 이상 입력해 주세요`
  if (trimmed.length > TEAM_NAME_MAX) return `${TEAM_NAME_MAX}자 이하로 입력해 주세요`
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return '글자 또는 숫자를 포함해야 해요'
  return null
}

function validateMemberName(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MEMBER_NAME_MAX) return `${MEMBER_NAME_MAX}자 이하로 입력해 주세요`
  return null
}

export default function TeamCreate() {
  const navigate = useNavigate()
  const setTeam = useTeamStore((s) => s.setTeam)

  const [teamName, setTeamName] = useState('')
  const [dupStatus, setDupStatus] = useState<DupStatus>('idle')

  const memberIdRef = useRef(MEMBER_MIN + 1)
  const [members, setMembers] = useState<Member[]>(
    Array.from({ length: MEMBER_MIN }, (_, i) => ({ id: i + 1, name: '' })),
  )

  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const trimmedName = teamName.trim()
  const nameError = validateTeamName(teamName)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // Debounced duplicate check
  useEffect(() => {
    if (nameError || trimmedName.length === 0) {
      setDupStatus('idle')
      return
    }
    setDupStatus('checking')
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('tanggo_teams')
        .select('id')
        .eq('team_name', trimmedName)
        .maybeSingle()
      if (error) {
        setDupStatus('error')
      } else {
        setDupStatus(data ? 'duplicate' : 'available')
      }
    }, 500)
    return () => clearTimeout(t)
  }, [trimmedName, nameError])

  function addMember() {
    if (members.length >= MEMBER_MAX) return
    setMembers((prev) => [...prev, { id: memberIdRef.current++, name: '' }])
  }

  function removeMember(id: number) {
    setMembers((prev) => {
      if (prev.length <= MEMBER_MIN) return prev
      return prev.filter((m) => m.id !== id)
    })
  }

  function updateMember(id: number, name: string) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)))
  }

  const memberErrors = members.map((m) => validateMemberName(m.name))
  const allMembersFilled = members.every((m) => m.name.trim().length > 0)
  const allMembersValid = memberErrors.every((e) => e === null)
  const filledCount = members.filter((m) => m.name.trim().length > 0).length

  const canSubmit =
    !submitting &&
    !nameError &&
    trimmedName.length > 0 &&
    dupStatus === 'available' &&
    allMembersFilled &&
    allMembersValid

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)

    const leaderName = members[0].name.trim()
    const { data: team, error: teamError } = await supabase
      .from('tanggo_teams')
      .insert({
        team_name: trimmedName,
        member_count: members.length,
        leader_name: leaderName, // 첫 번째 팀원 = 방장
      })
      .select('id, team_name, leader_name')
      .single()

    if (teamError || !team) {
      const msg = teamError?.message ?? '알 수 없는 오류'
      const isDup = msg.includes('duplicate') || msg.includes('unique')
      setToast(isDup ? '이미 사용 중인 팀 이름이에요' : `팀 생성 실패: ${msg}`)
      if (isDup) setDupStatus('duplicate')
      setSubmitting(false)
      return
    }

    const rows = members.map((m) => ({
      team_id: team.id,
      name: m.name.trim(),
    }))
    const { error: memError } = await supabase
      .from('tanggo_team_members')
      .insert(rows)

    if (memError) {
      await supabase.from('tanggo_teams').delete().eq('id', team.id)
      setToast(`팀원 등록 실패: ${memError.message}`)
      setSubmitting(false)
      return
    }

    // 행사가 이미 시작된 뒤에 만들어진 팀은 관리자가 [행사 시작]을 다시 누르지 않아도
    // 바로 미션을 진행할 수 있도록 started_at 을 즉시 채워준다.
    // (행사 시작 = 대기 중이던 모든 팀의 started_at 일괄 설정 → 시작된 팀이 하나라도 있으면 진행 중)
    const [startedRes, configRes] = await Promise.all([
      supabase
        .from('tanggo_teams')
        .select('id')
        .not('started_at', 'is', null)
        .limit(1),
      supabase
        .from('tanggo_event_config')
        .select('service_ended')
        .eq('id', 1)
        .maybeSingle(),
    ])
    const eventRunning =
      (startedRes.data?.length ?? 0) > 0 && !configRes.data?.service_ended
    if (eventRunning) {
      await supabase
        .from('tanggo_teams')
        .update({ started_at: new Date().toISOString() })
        .eq('id', team.id)
    }

    setTeam(team.id, team.team_name, leaderName)
    navigate('/lobby')
  }

  return (
    <div className="relative min-h-screen bg-cream pb-32">
      {/* 헤더 */}
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
          팀 만들기
        </h1>
      </header>

      <main className="mx-auto max-w-md px-5 pt-2">
        {/* 카드 */}
        <section
          className="rounded-3xl border-4 border-orange-main bg-white px-5 pt-6 pb-6"
          style={{ boxShadow: 'var(--shadow-orange)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              🎮
            </span>
            <h2 className="text-xl font-bold text-text-dark">우리 팀 만들기</h2>
          </div>
          <p className="mt-1.5 text-sm text-text-dark/60">
            팀 이름과 팀원을 입력하세요
          </p>

          {/* 팀 이름 */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <label htmlFor="team-name" className="text-sm font-bold text-text-dark">
                🏷️ 팀 이름
              </label>
              <span className="text-xs font-medium text-text-dark/50">
                {trimmedName.length} / {TEAM_NAME_MAX}자
              </span>
            </div>
            <input
              id="team-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value.slice(0, TEAM_NAME_MAX))}
              placeholder="예: 동래 탐험대"
              maxLength={TEAM_NAME_MAX}
              autoComplete="off"
              className={`mt-2 w-full px-4 py-3.5 rounded-2xl border-2 bg-white text-base font-medium placeholder:text-text-dark/30 focus:outline-none focus:ring-2 transition-colors ${
                nameError || dupStatus === 'duplicate'
                  ? 'border-[#E94B3C] focus:border-[#E94B3C] focus:ring-[#E94B3C]/20'
                  : 'border-text-dark/10 focus:border-orange-main focus:ring-orange-main/20'
              }`}
            />
            <div className="mt-1.5 min-h-[1.25rem] text-xs font-medium">
              {nameError && (
                <span className="text-[#E94B3C]">{nameError}</span>
              )}
              {!nameError && dupStatus === 'checking' && (
                <span className="text-text-dark/50">확인 중...</span>
              )}
              {!nameError && dupStatus === 'available' && (
                <span className="text-[#4CAF7F]">✓ 사용 가능한 이름이에요</span>
              )}
              {!nameError && dupStatus === 'duplicate' && (
                <span className="text-[#E94B3C]">
                  이미 사용 중인 팀 이름이에요
                </span>
              )}
              {!nameError && dupStatus === 'error' && (
                <span className="text-[#E94B3C]">
                  중복 확인 실패. 잠시 후 다시 시도해 주세요
                </span>
              )}
            </div>
          </div>

          {/* 팀원 */}
          <div className="mt-4">
            <label className="text-sm font-bold text-text-dark">
              👥 팀원{' '}
              <span className="font-medium text-text-dark/60">
                (현재 {filledCount}명 / {MEMBER_MIN}~{MEMBER_MAX}명)
              </span>
            </label>
            <div className="mt-2 flex flex-col gap-2">
              {members.map((m, idx) => {
                const err = memberErrors[idx]
                const removable = idx >= MEMBER_MIN
                return (
                  <div key={m.id} className="flex items-start gap-2">
                    <div className="flex-1 relative">
                      <div
                        aria-hidden
                        className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1"
                      >
                        <span className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-orange-sub text-white text-xs font-bold tabular-nums">
                          {idx + 1}
                        </span>
                        {idx === 0 && (
                          <span className="text-sm leading-none" title="방장">
                            👑
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) =>
                          updateMember(m.id, e.target.value.slice(0, MEMBER_NAME_MAX))
                        }
                        placeholder={idx === 0 ? '방장 이름 (본인)' : '팀원 이름'}
                        maxLength={MEMBER_NAME_MAX}
                        autoComplete="off"
                        aria-label={
                          idx === 0 ? '방장 이름 (본인)' : `팀원 ${idx + 1} 이름`
                        }
                        className={`w-full ${idx === 0 ? 'pl-[4.75rem]' : 'pl-12'} pr-4 py-3 rounded-2xl border-2 bg-white text-base font-medium placeholder:text-text-dark/30 focus:outline-none focus:ring-2 transition-colors ${
                          err
                            ? 'border-[#E94B3C] focus:border-[#E94B3C] focus:ring-[#E94B3C]/20'
                            : 'border-text-dark/10 focus:border-orange-main focus:ring-orange-main/20'
                        }`}
                      />
                      {err && (
                        <p className="mt-1 text-xs font-medium text-[#E94B3C]">
                          {err}
                        </p>
                      )}
                    </div>
                    {removable && (
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        aria-label={`팀원 ${idx + 1} 삭제`}
                        className="w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-2xl border-2 border-text-dark/10 text-text-dark/50 hover:border-[#E94B3C] hover:text-[#E94B3C] transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {members.length < MEMBER_MAX ? (
              <button
                type="button"
                onClick={addMember}
                className="mt-2 w-full py-3 rounded-2xl border-2 border-dashed border-orange-main/50 text-sm font-bold text-orange-main hover:bg-orange-main/5 transition-colors"
              >
                + 팀원 추가
              </button>
            ) : (
              <p className="mt-2 text-center text-xs font-medium text-text-dark/40">
                최대 {MEMBER_MAX}명까지 가능
              </p>
            )}
          </div>
        </section>

        {/* 규칙 안내 */}
        <div className="mt-4 rounded-2xl bg-text-dark/5 px-4 py-3 text-xs leading-relaxed text-text-dark/70">
          <p>👑 첫 번째 팀원이 방장이 되어 팀 답안을 제출해요</p>
          <p>ℹ️ 게임 시작 후엔 팀원을 바꿀 수 없어요</p>
          <p>ℹ️ 한 번 만든 팀 이름은 다른 팀이 사용할 수 없어요</p>
          <p>ℹ️ 팀원은 {MEMBER_MIN}명 이상 {MEMBER_MAX}명 이하로 입력해주세요</p>
        </div>
      </main>

      {/* 하단 고정 제출 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-cream via-cream to-cream/0">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={`w-full rounded-2xl py-4 text-lg font-bold transition-all duration-150 ${
              canSubmit
                ? 'bg-orange-main text-white hover:-translate-y-0.5 hover:bg-orange-sub active:translate-y-0 active:scale-[0.98]'
                : 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
            }`}
            style={canSubmit ? { boxShadow: 'var(--shadow-orange)' } : undefined}
          >
            {submitting ? '만드는 중...' : '✅ 팀 만들기 완료'}
          </button>
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-[#E94B3C] text-white text-sm font-semibold shadow-lg max-w-[90vw] text-center"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
