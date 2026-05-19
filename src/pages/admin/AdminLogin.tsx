import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { SEASON_CONFIG } from '../../config/seasonConfig'
import { ADMIN_AUTH_KEY } from '../../components/AdminProtected'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const alreadyAuthed =
    typeof window !== 'undefined' &&
    localStorage.getItem(ADMIN_AUTH_KEY) === 'true'
  if (alreadyAuthed) {
    return <Navigate to="/admin/dashboard" replace />
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const expected = import.meta.env.VITE_ADMIN_PASSWORD
    if (!expected) {
      setError('관리자 비밀번호가 설정되어 있지 않아요')
      return
    }
    if (password === expected) {
      localStorage.setItem(ADMIN_AUTH_KEY, 'true')
      navigate('/admin/dashboard', { replace: true })
    } else {
      setError('비밀번호가 틀렸어요')
    }
  }

  return (
    <div className="min-h-screen bg-cream">
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
          관리자
        </h1>
      </header>

      <main className="mx-auto max-w-md px-5 pt-10">
        <form
          onSubmit={handleSubmit}
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

          <div className="text-center">
            <div className="text-5xl" aria-hidden>
              🔐
            </div>
            <h2 className="mt-3 text-xl font-bold text-text-dark">관리자 로그인</h2>
            <p className="mt-1 text-sm text-text-dark/60">
              {SEASON_CONFIG.seasonName} 운영 화면
            </p>
          </div>

          <div className="mt-6">
            <label htmlFor="admin-password" className="text-sm font-bold text-text-dark">
              비밀번호
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              placeholder="비밀번호 입력"
              autoComplete="current-password"
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
            type="submit"
            disabled={password.length === 0}
            className={`mt-2 w-full rounded-2xl py-4 text-lg font-bold transition-all duration-150 ${
              password.length > 0
                ? 'bg-orange-main text-white hover:-translate-y-0.5 hover:bg-orange-sub active:translate-y-0 active:scale-[0.98]'
                : 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
            }`}
            style={password.length > 0 ? { boxShadow: 'var(--shadow-orange)' } : undefined}
          >
            들어가기
          </button>
        </form>
      </main>
    </div>
  )
}
