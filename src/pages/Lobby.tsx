import { useTeamStore } from '../lib/teamStore'

export default function Lobby() {
  const teamName = useTeamStore((s) => s.teamName)

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-2xl font-bold text-text-dark">
          🏃 {teamName ?? '???'} 팀, 대기실에 도착!
        </p>
        <p className="mt-3 text-base text-text-dark/60">
          출발 신호를 기다리는 중...
        </p>
      </div>
    </div>
  )
}
