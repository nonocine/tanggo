import { Navigate } from 'react-router-dom'

export const ADMIN_AUTH_KEY = 'tanggo_admin_auth'

interface Props {
  children: React.ReactNode
}

export default function AdminProtected({ children }: Props) {
  const isAuthed =
    typeof window !== 'undefined' &&
    localStorage.getItem(ADMIN_AUTH_KEY) === 'true'

  if (!isAuthed) {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}
