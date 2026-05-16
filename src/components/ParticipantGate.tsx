import { Navigate } from 'react-router-dom'
import { useTeamStore } from '../lib/teamStore'

interface Props {
  children: React.ReactNode
}

export default function ParticipantGate({ children }: Props) {
  const teamId = useTeamStore((s) => s.teamId)

  if (!teamId) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
