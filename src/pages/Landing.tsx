import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_CONFIG } from '../config/appConfig'
import { SEASON_CONFIG } from '../config/seasonConfig'
import MainTitle from '../components/MainTitle'
import SeasonTitle from '../components/SeasonTitle'

export default function Landing() {
  const navigate = useNavigate()
  const [gearOpen, setGearOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!gearOpen) return
    const onClick = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [gearOpen])

  const footerText = `${APP_CONFIG.appName} · ${SEASON_CONFIG.seasonName} · ${APP_CONFIG.appOrganizer}`

  return (
    <div className="relative min-h-screen bg-cream overflow-hidden">
      {/* 우상단 격자 데코 */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 w-48 h-48 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,107,71,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,107,71,0.25) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          maskImage:
            'radial-gradient(circle at top right, black 0%, transparent 70%)',
          WebkitMaskImage:
            'radial-gradient(circle at top right, black 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-md px-6 pt-10 pb-10 flex flex-col min-h-screen">
        {/* 헤더 */}
        <header className="flex flex-col items-center text-center">
          <img
            src="/logo1.png"
            alt={`${APP_CONFIG.appName} 로고`}
            className="h-20 w-auto"
          />
          <div className="mt-3">
            <MainTitle size="md" />
          </div>
          <div className="mt-2">
            <SeasonTitle />
          </div>
          <p className="mt-2 text-sm font-medium text-text-dark/60">
            {APP_CONFIG.appSlogan}
          </p>
        </header>

        {/* 클립보드 카드 */}
        <section
          className="relative mt-8 rounded-3xl border-4 border-orange-main bg-white px-6 pt-10 pb-6"
          style={{ boxShadow: 'var(--shadow-orange)' }}
        >
          {/* 클립 */}
          <div
            aria-hidden
            className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center"
          >
            <div className="w-24 h-6 rounded-lg bg-gradient-to-b from-gray-300 to-gray-400 shadow-md" />
            <div className="w-3 h-2 -mt-0.5 rounded-b-sm bg-gray-400" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              🎯
            </span>
            <h2 className="text-lg font-bold text-text-dark">미션 안내</h2>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-text-dark/75">
            팀을 만들어 학교 곳곳에 숨겨진 미션을 찾고
            <br />
            가장 빠르게 풀어 1등을 차지하세요!
          </p>

          <ul className="mt-5 flex flex-wrap gap-2">
            <li className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-cream text-xs font-semibold text-text-dark/80">
              <span aria-hidden>🚫</span> 답안 공유 금지
            </li>
            <li className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-cream text-xs font-semibold text-text-dark/80">
              <span aria-hidden>🚷</span> 엘리베이터 금지
            </li>
            <li className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-cream text-xs font-semibold text-text-dark/80">
              <span aria-hidden>🐢</span> 절대 뛰지 않기
            </li>
          </ul>
        </section>

        {/* 액션 버튼 */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate('/team-create')}
            className="w-full rounded-2xl bg-orange-main py-4 text-lg font-bold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-orange-sub active:translate-y-0 active:scale-[0.98]"
            style={{ boxShadow: 'var(--shadow-orange)' }}
          >
            <span className="mr-2" aria-hidden>
              👥
            </span>
            팀 만들기
          </button>
          <button
            type="button"
            onClick={() => navigate('/team-join')}
            className="w-full rounded-2xl border-2 border-orange-main bg-white py-4 text-lg font-bold text-orange-main transition-all duration-150 hover:-translate-y-0.5 hover:bg-orange-main/5 active:translate-y-0 active:scale-[0.98]"
            style={{ boxShadow: 'var(--shadow-orange-sm)' }}
          >
            <span className="mr-2" aria-hidden>
              🔍
            </span>
            우리 팀 들어가기
          </button>
        </div>

        {/* 푸터 */}
        <footer className="mt-auto pt-10 flex items-center justify-center relative">
          <p className="text-[11px] font-medium text-text-dark/40 text-center">
            {footerText}
          </p>

          <div ref={gearRef} className="absolute right-0 bottom-0">
            <button
              type="button"
              aria-label="관리자/운영자 메뉴"
              onClick={() => setGearOpen((v) => !v)}
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-dark/40 hover:text-text-dark/70 hover:bg-white transition-colors"
            >
              <span aria-hidden className="text-lg">
                ⚙
              </span>
            </button>
            {gearOpen && (
              <div
                role="menu"
                className="absolute right-0 bottom-11 w-32 overflow-hidden rounded-xl bg-white py-1"
                style={{ boxShadow: 'var(--shadow-orange-sm)' }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => navigate('/admin')}
                  className="w-full px-4 py-2 text-left text-sm font-semibold text-text-dark hover:bg-cream"
                >
                  관리자
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => navigate('/operator')}
                  className="w-full px-4 py-2 text-left text-sm font-semibold text-text-dark hover:bg-cream"
                >
                  운영자
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
