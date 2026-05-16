import { Navigate } from 'react-router-dom'

export const OPERATOR_AUTH_KEY = 'tanggo_operator_auth'

interface Props {
  children: React.ReactNode
}

export default function OperatorProtected({ children }: Props) {
  const isAuthed =
    typeof window !== 'undefined' &&
    localStorage.getItem(OPERATOR_AUTH_KEY) === 'true'

  if (!isAuthed) {
    return <Navigate to="/operator" replace />
  }
  return <>{children}</>
}
