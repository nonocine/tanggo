import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEASON_CONFIG } from '../../config/seasonConfig'
import { ADMIN_AUTH_KEY } from '../../components/AdminProtected'
import QuizManager from './tabs/QuizManager'
import TeamManager from './tabs/TeamManager'
import GameProgress from './tabs/GameProgress'
import EventSettings from './tabs/EventSettings'

type TabKey =
  | 'quiz'
  | 'teams'
  | 'progress'
  | 'approvals'
  | 'results'
  | 'settings'
  | 'reports'
  | 'data'

interface TabDef {
  key: TabKey
  icon: string
  label: string
}

const TABS: TabDef[] = [
  { key: 'quiz', icon: '📋', label: '미션 관리' },
  { key: 'teams', icon: '👥', label: '팀 관리' },
  { key: 'progress', icon: '🎮', label: '게임 진행 상황' },
  { key: 'approvals', icon: '✋', label: '미션 승인' },
  { key: 'results', icon: '🏆', label: '순위/결과' },
  { key: 'settings', icon: '⚙', label: '행사 설정' },
  { key: 'reports', icon: '📊', label: '보고서' },
  { key: 'data', icon: '🗑', label: '데이터 관리' },
]

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4" aria-hidden>
        🚧
      </div>
      <p className="text-lg font-bold text-text-dark/70">
        {label} — 준비 중입니다
      </p>
      <p className="mt-1 text-sm text-text-dark/40">
        다음 단계에서 구현 예정
      </p>
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [currentTab, setCurrentTab] = useState<TabKey>('quiz')

  function handleLogout() {
    localStorage.removeItem(ADMIN_AUTH_KEY)
    navigate('/', { replace: true })
  }

  const activeLabel = TABS.find((t) => t.key === currentTab)?.label ?? ''

  return (
    <div className="min-h-screen bg-cream">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white border-b border-text-dark/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0" aria-hidden>
              🛠
            </span>
            <h1 className="text-sm md:text-base font-bold text-text-dark truncate">
              관리자
              <span className="text-text-dark/40 mx-1.5">·</span>
              <span className="text-orange-main">{SEASON_CONFIG.seasonName}</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 px-3 py-1.5 text-xs md:text-sm font-bold text-text-dark/70 rounded-lg border border-text-dark/15 hover:bg-cream hover:text-text-dark transition-colors"
          >
            로그아웃
          </button>
        </div>

        {/* 모바일 탭바 */}
        <nav className="md:hidden overflow-x-auto border-t border-text-dark/10">
          <ul className="flex min-w-max">
            {TABS.map((t) => {
              const active = t.key === currentTab
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => setCurrentTab(t.key)}
                    className={`px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                      active
                        ? 'border-orange-main text-orange-main'
                        : 'border-transparent text-text-dark/60 hover:text-text-dark'
                    }`}
                  >
                    <span aria-hidden className="mr-1">
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      <div className="md:flex">
        {/* 데스크탑 사이드바 */}
        <aside className="hidden md:block w-56 shrink-0 border-r border-text-dark/10 bg-white min-h-[calc(100vh-57px)]">
          <nav className="p-3">
            <ul className="flex flex-col gap-1">
              {TABS.map((t) => {
                const active = t.key === currentTab
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => setCurrentTab(t.key)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        active
                          ? 'bg-orange-main text-white'
                          : 'text-text-dark/70 hover:bg-cream hover:text-text-dark'
                      }`}
                    >
                      <span aria-hidden className="mr-2">
                        {t.icon}
                      </span>
                      {t.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        {/* 본문 */}
        <main className="flex-1 min-w-0 px-4 md:px-6 py-5 md:py-6">
          {currentTab === 'quiz' && <QuizManager />}
          {currentTab === 'teams' && <TeamManager />}
          {currentTab === 'progress' && <GameProgress />}
          {currentTab === 'settings' && <EventSettings />}
          {currentTab !== 'quiz' &&
            currentTab !== 'teams' &&
            currentTab !== 'progress' &&
            currentTab !== 'settings' && <Placeholder label={activeLabel} />}
        </main>
      </div>
    </div>
  )
}
