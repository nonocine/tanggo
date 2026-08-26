import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTeamStore } from '../lib/teamStore'
import AnnouncementBanner from '../components/AnnouncementBanner'

interface DayDef {
  day: number
  label: string
  desc: string
}

const DEFAULT_DAYS: DayDef[] = [
  { day: 1, label: '1일차', desc: '기관 라운딩 미션' },
  { day: 2, label: '2일차', desc: '장소별 미션 수행' },
]

const DAY_EMOJI: Record<number, string> = {
  1: '📅',
  2: '🗺️',
}

function parseDays(raw: unknown): DayDef[] {
  if (!Array.isArray(raw)) return DEFAULT_DAYS
  const parsed: DayDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const day = Number(rec.day)
    if (!Number.isFinite(day)) continue
    parsed.push({
      day,
      label: typeof rec.label === 'string' ? rec.label : `${day}일차`,
      desc: typeof rec.desc === 'string' ? rec.desc : '',
    })
  }
  if (parsed.length === 0) return DEFAULT_DAYS
  return parsed.sort((a, b) => a.day - b.day)
}

export default function DaySelect() {
  const navigate = useNavigate()
  const teamId = useTeamStore((s) => s.teamId)
  const teamName = useTeamStore((s) => s.teamName)

  const [days, setDays] = useState<DayDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    fetchDays()
  }, [fetchDays])

  function goDay(day: number) {
    if (day === 2) {
      navigate('/location-select')
    } else {
      navigate(`/mission?day=${day}`)
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
            {days.map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => goDay(d.day)}
                className="w-full text-left rounded-3xl border-4 border-orange-main bg-white px-5 py-6 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all"
                style={{ boxShadow: 'var(--shadow-orange)' }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-5xl shrink-0" aria-hidden>
                    {DAY_EMOJI[d.day] ?? '📌'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-black text-text-dark">{d.label}</p>
                    {d.desc && (
                      <p className="mt-1 text-sm font-semibold text-text-dark/60">
                        {d.desc}
                      </p>
                    )}
                    <p className="mt-2 text-xs font-bold text-orange-main">
                      시작하기 →
                    </p>
                  </div>
                </div>
              </button>
            ))}
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
