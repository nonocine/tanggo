import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEASON_CONFIG } from '../../config/seasonConfig'
import { OPERATOR_AUTH_KEY } from '../../components/OperatorProtected'
import MissionApprovalQueue from '../../components/MissionApprovalQueue'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatHMS(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function OperatorDashboard() {
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function handleLogout() {
    localStorage.removeItem(OPERATOR_AUTH_KEY)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-cream">
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
        <MissionApprovalQueue actorLabel="운영자" />
      </main>
    </div>
  )
}
