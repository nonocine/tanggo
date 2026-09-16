import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'
import type { DayDef } from '../lib/eventDays'
import { dayEmoji, normalizeDayNumber, parseDays } from '../lib/eventDays'

export default function DaySelect() {
  const navigate = useNavigate()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)

  const [days, setDays] = useState<DayDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 이미 진행한 일차가 있으면 그 일차만 열어 준다 (null = 아직 자유 선택)
  const [activatedDay, setActivatedDay] = useState<number | null>(null)
  const [checkingDay, setCheckingDay] = useState(true)

  const fetchDays = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('tanggo_event_config')
      .select('days')
      .eq('id', 1)
      .maybeSingle()
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setError(null)
    setDays(parseDays(data?.days))
    setLoading(false)
  }, [])

  // 팀이 이미 어떤 일차를 진행했는지 확인한다.
  // 제출한 답변 / 미션 신청의 quiz_id 를 모아 해당 문항의 day_number 로 판정.
  const checkActivatedDay = useCallback(async () => {
    if (!teamId) return
    setCheckingDay(true)

    const [answersRes, requestsRes] = await Promise.all([
      supabase.from('tanggo_answers').select('quiz_id').eq('team_id', teamId),
      supabase
        .from('tanggo_mission_requests')
        .select('quiz_id')
        .eq('team_id', teamId),
    ])

    const rows = [
      ...((answersRes.data ?? []) as { quiz_id: string | null }[]),
      ...((requestsRes.data ?? []) as { quiz_id: string | null }[]),
    ]
    const quizIds = Array.from(
      new Set(rows.map((r) => r.quiz_id).filter((v): v is string => !!v)),
    )

    // 둘 다 0건 = 아직 아무것도 안 함 → 두 일차 모두 자유 선택
    if (quizIds.length === 0) {
      setActivatedDay(null)
      setCheckingDay(false)
      return
    }

    const { data: quizRows } = await supabase
      .from('tanggo_quizzes')
      .select('id, day_number')
      .in('id', quizIds)

    const found = new Set<number>()
    for (const row of (quizRows ?? []) as { day_number: number | null }[]) {
      // Phase 2 이전 문항은 day_number 가 null → 1일차로 취급한다
      found.add(normalizeDayNumber(row.day_number))
    }

    // 정확히 한 일차만 진행했을 때만 잠근다.
    // (기록이 없거나 두 일차가 섞인 예외 상황에서는 팀이 갇히지 않도록 둘 다 열어 둔다)
    setActivatedDay(found.size === 1 ? [...found][0] : null)
    setCheckingDay(false)
  }, [teamId])

  useEffect(() => {
    fetchDays()
  }, [fetchDays])

  useEffect(() => {
    checkActivatedDay()
  }, [checkActivatedDay])

  // 장소 배정을 쓰는 일차만 장소 선택 화면을 거친다
  function goDay(d: DayDef) {
    if (d.use_location_assign) {
      navigate(`/location-select?day=${d.day}`)
    } else {
      navigate(`/mission?day=${d.day}`)
    }
  }

  if (!teamId) return null

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AnnouncementBanner />

      <header className="px-4 pt-4 pb-2 text-center">
        <p className="text-xs font-medium text-text-dark/50">
          🏷️ {teamName ?? '???'} 팀
        </p>
      </header>

      <main className="flex-1 mx-auto w-full max-w-md px-5 py-4 flex flex-col">
        <div className="text-center">
          <h1 className="text-2xl font-black text-text-dark">
            어떤 일차를 진행할까요?
          </h1>
          <p className="mt-1.5 text-sm text-text-dark/60">
            운영자 안내에 맞는 일차를 선택해 주세요
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-text-dark/50">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-[#E94B3C]">{error}</p>
            <button
              type="button"
              onClick={fetchDays}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/10 hover:bg-cream"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {days.map((d) => {
              const locked =
                !checkingDay && activatedDay !== null && d.day !== activatedDay
              const disabled = checkingDay || locked
              return (
                <div key={d.day}>
                  <button
                    type="button"
                    onClick={() => goDay(d)}
                    disabled={disabled}
                    className={`w-full text-left rounded-3xl border-4 border-orange-main bg-white px-5 py-6 transition-all ${
                      locked
                        ? 'opacity-40 cursor-not-allowed grayscale'
                        : checkingDay
                          ? 'cursor-wait'
                          : 'hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]'
                    }`}
                    style={{ boxShadow: 'var(--shadow-orange)' }}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-5xl shrink-0" aria-hidden>
                        {dayEmoji(d.day)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xl font-black text-text-dark">
                          {d.label}
                        </p>
                        {d.desc && (
                          <p className="mt-1 text-sm font-semibold text-text-dark/60">
                            {d.desc}
                          </p>
                        )}
                        {checkingDay ? (
                          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-orange-main">
                            <span
                              aria-hidden
                              className="w-3.5 h-3.5 rounded-full border-2 border-orange-main/30 border-t-orange-main animate-spin"
                            />
                            확인 중...
                          </span>
                        ) : locked ? (
                          <p className="mt-2 text-xs font-bold text-text-dark/40">
                            선택할 수 없어요
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-bold text-orange-main">
                            시작하기 →
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                  {locked && (
                    <p className="mt-1.5 text-center text-[11px] font-semibold text-text-dark/45">
                      {days.find((x) => x.day === activatedDay)?.label ??
                        `${activatedDay}일차`}{' '}
                      진행 중
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/lobby')}
            className="text-xs font-semibold text-text-dark/40 hover:text-orange-main underline"
          >
            ← 대기실로 돌아가기
          </button>
        </div>
      </main>
    </div>
  )
}
