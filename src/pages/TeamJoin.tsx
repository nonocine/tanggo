import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTeamFromName, useTeamStore } from '../lib/teamStore'

const TEAM_NAME_MAX = 12

export default function TeamJoin() {
  const navigate = useNavigate()
  const setTeam = useTeamStore((s) => s.setTeam)

  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const trimmed = teamName.trim()
  const canSubmit = trimmed.length > 0 && !searching

  async function handleSubmit() {
    if (!canSubmit) return
    setSearching(true)
    setError(null)
    const team = await getTeamFromName(trimmed)
    if (!team) {
      setError('그런 팀 이름은 없어요. 팀 이름을 확인해주세요')
      setSearching(false)
      return
    }
    setTeam(team.id, team.team_name)
    if (team.finished_at) {
      navigate('/result', { replace: true })
    } else if (team.started_at) {
      navigate('/mission', { replace: true })
    } else {
      navigate('/lobby', { replace: true })
    }
  }

  return (
    <div className="relative min-h-screen bg-cream">
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
          우리 팀 들어가기
        </h1>
      </header>

      <main className="mx-auto max-w-md px-5 pt-6">
        <section
          className="relative rounded-3xl border-4 border-orange-main bg-white px-6 pt-10 pb-6"
          style={{ boxShadow: 'var(--shadow-orange)' }}
        >
          <div
            aria-hidden
            className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center"
          >
            <div className="w-24 h-6 rounded-lg bg-gradient-to-b from-gray-300 to-gray-400 shadow-md" />
            <div className="w-3 h-2 -mt-0.5 rounded-b-sm bg-gray-400" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              🔍
            </span>
            <h2 className="text-xl font-bold text-text-dark">팀 찾아 들어가기</h2>
          </div>
          <p className="mt-1.5 text-sm text-text-dark/60">
            우리 팀 이름을 입력하면 게임 화면으로 들어갈 수 있어요
          </p>

          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <label htmlFor="join-team-name" className="text-sm font-bold text-text-dark">
                🏷️ 팀 이름
              </label>
              <span className="text-xs font-medium text-text-dark/50">
                {trimmed.length} / {TEAM_NAME_MAX}자
              </span>
            </div>
            <input
              id="join-team-name"
              type="text"
              value={teamName}
              onChange={(e) => {
                setTeamName(e.target.value.slice(0, TEAM_NAME_MAX))
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
              placeholder="팀 이름 입력"
              maxLength={TEAM_NAME_MAX}
              autoComplete="off"
              className={`mt-2 w-full px-4 py-3.5 rounded-2xl border-2 bg-white text-base font-medium placeholder:text-text-dark/30 focus:outline-none focus:ring-2 transition-colors ${
                error
                  ? 'border-[#E94B3C] focus:border-[#E94B3C] focus:ring-[#E94B3C]/20'
                  : 'border-text-dark/10 focus:border-orange-main focus:ring-orange-main/20'
              }`}
            />
            <div className="mt-1.5 min-h-[1.25rem] text-xs font-medium">
              {error && <span className="text-[#E94B3C]">{error}</span>}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`mt-2 w-full rounded-2xl py-4 text-lg font-bold transition-all duration-150 ${
              canSubmit
                ? 'bg-orange-main text-white hover:-translate-y-0.5 hover:bg-orange-sub active:translate-y-0 active:scale-[0.98]'
                : 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
            }`}
            style={canSubmit ? { boxShadow: 'var(--shadow-orange)' } : undefined}
          >
            {searching ? '찾는 중...' : '🚪 들어가기'}
          </button>
        </section>

        <p className="mt-4 px-2 text-xs text-text-dark/60">
          ℹ️ 팀 이름이 기억나지 않으면 운영자에게 문의하세요
        </p>
      </main>
    </div>
  )
}
