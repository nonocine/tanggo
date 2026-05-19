import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SEASON_CONFIG } from '../../config/seasonConfig'
import { ADMIN_AUTH_KEY } from '../../components/AdminProtected'
import QuizManager from './tabs/QuizManager'
import TeamManager from './tabs/TeamManager'
import GameProgress from './tabs/GameProgress'
import EventSettings from './tabs/EventSettings'
import MissionApproval from './tabs/MissionApproval'
import SurveyManager from './tabs/SurveyManager'
import ReportManager from './tabs/ReportManager'
import DataManager from './tabs/DataManager'
import TextManager from './tabs/TextManager'

type TabKey =
  | 'quiz'
  | 'teams'
  | 'progress'
  | 'approvals'
  | 'results'
  | 'settings'
  | 'text'
  | 'survey'
  | 'reports'
  | 'data'

interface TabDef {
  key: TabKey
  icon: string
  label: string
  shortLabel?: string
}

const TABS: TabDef[] = [
  { key: 'quiz', icon: '📋', label: '미션 관리' },
  { key: 'teams', icon: '👥', label: '팀 관리' },
  { key: 'progress', icon: '🎮', label: '게임 진행 상황', shortLabel: '진행' },
  { key: 'approvals', icon: '✋', label: '미션 승인', shortLabel: '승인' },
  { key: 'results', icon: '🏆', label: '순위/결과' },
  { key: 'settings', icon: '⚙', label: '행사 설정', shortLabel: '설정' },
  { key: 'text', icon: '💬', label: '문구 관리' },
  { key: 'survey', icon: '📝', label: '설문 관리' },
  { key: 'reports', icon: '📊', label: '보고서' },
  { key: 'data', icon: '🗑', label: '데이터 관리' },
]

const PRIMARY_MOBILE_TABS: TabKey[] = ['progress', 'settings', 'approvals']

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
  const [currentTab, setCurrentTab] = useState<TabKey>('progress')
  const [moreOpen, setMoreOpen] = useState(false)

  function handleLogout() {
    localStorage.removeItem(ADMIN_AUTH_KEY)
    navigate('/', { replace: true })
  }

  const activeLabel = TABS.find((t) => t.key === currentTab)?.label ?? ''
  const primaryTabs = PRIMARY_MOBILE_TABS.map(
    (k) => TABS.find((t) => t.key === k)!,
  )
  const secondaryTabs = TABS.filter(
    (t) => !PRIMARY_MOBILE_TABS.includes(t.key),
  )
  const isPrimaryActive = PRIMARY_MOBILE_TABS.includes(currentTab)

  function selectTab(k: TabKey) {
    setCurrentTab(k)
    setMoreOpen(false)
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white border-b border-text-dark/10">
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0" aria-hidden>
              🛠
            </span>
            <h1 className="text-sm md:text-base font-bold text-text-dark truncate">
              <span className="md:hidden">관리자</span>
              <span className="hidden md:inline">
                관리자
                <span className="text-text-dark/40 mx-1.5">·</span>
                <span className="text-orange-main">
                  {SEASON_CONFIG.seasonName}
                </span>
              </span>
            </h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="로그아웃"
            className="shrink-0 inline-flex items-center justify-center text-text-dark/70 rounded-lg border border-text-dark/15 hover:bg-cream hover:text-text-dark transition-colors h-9 px-2 md:px-3 text-base md:text-sm md:font-bold"
          >
            <span className="md:hidden" aria-hidden>
              🚪
            </span>
            <span className="hidden md:inline">로그아웃</span>
          </button>
        </div>
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
        <main className="flex-1 min-w-0 px-3 md:px-6 py-5 md:py-6 pb-24 md:pb-6">
          {currentTab === 'quiz' && <QuizManager />}
          {currentTab === 'teams' && <TeamManager />}
          {currentTab === 'progress' && <GameProgress />}
          {currentTab === 'settings' && <EventSettings />}
          {currentTab === 'approvals' && <MissionApproval />}
          {currentTab === 'text' && <TextManager />}
          {currentTab === 'survey' && <SurveyManager />}
          {currentTab === 'reports' && <ReportManager />}
          {currentTab === 'data' && <DataManager />}
          {currentTab !== 'quiz' &&
            currentTab !== 'teams' &&
            currentTab !== 'progress' &&
            currentTab !== 'settings' &&
            currentTab !== 'approvals' &&
            currentTab !== 'text' &&
            currentTab !== 'survey' &&
            currentTab !== 'reports' &&
            currentTab !== 'data' && <Placeholder label={activeLabel} />}
        </main>
      </div>

      {/* 모바일 하단 탭바 */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-text-dark/10"
        style={{
          boxShadow: '0 -2px 8px -2px rgba(0,0,0,0.06)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <ul className="grid grid-cols-4">
          {primaryTabs.map((t) => {
            const active = t.key === currentTab
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => selectTab(t.key)}
                  className={`w-full flex flex-col items-center justify-center py-2.5 transition-colors ${
                    active ? 'text-orange-main' : 'text-text-dark/50'
                  }`}
                >
                  <span aria-hidden className="text-2xl leading-none">
                    {t.icon}
                  </span>
                  <span className="mt-0.5 text-[11px] font-bold">
                    {t.shortLabel ?? t.label}
                  </span>
                </button>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`w-full flex flex-col items-center justify-center py-2.5 transition-colors ${
                !isPrimaryActive ? 'text-orange-main' : 'text-text-dark/50'
              }`}
            >
              <span aria-hidden className="text-2xl leading-none">
                ⋯
              </span>
              <span className="mt-0.5 text-[11px] font-bold">더보기</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* 더보기 모달 (모바일 전용) */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl px-4 pt-5 animate-slide-in-down"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-text-dark">메뉴 더보기</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="닫기"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-dark/50 hover:bg-cream text-xl"
              >
                ×
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-3">
              {secondaryTabs.map((t) => {
                const active = t.key === currentTab
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => selectTab(t.key)}
                      className={`w-full aspect-square flex flex-col items-center justify-center rounded-2xl border-2 transition-colors ${
                        active
                          ? 'bg-orange-main text-white border-orange-main'
                          : 'bg-white text-text-dark/70 border-text-dark/10 hover:border-orange-main hover:text-orange-main'
                      }`}
                    >
                      <span aria-hidden className="text-3xl leading-none">
                        {t.icon}
                      </span>
                      <span className="mt-2 text-xs font-bold text-center px-1 leading-tight">
                        {t.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
