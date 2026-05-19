import { useNavigate } from 'react-router-dom'
import { APP_CONFIG } from '../config/appConfig'
import { SEASON_CONFIG } from '../config/seasonConfig'
import { useText } from '../lib/useTextContent'
import MainTitle from '../components/MainTitle'
import SeasonTitle from '../components/SeasonTitle'

export default function Landing() {
  const navigate = useNavigate()
  const welcomeTitle = useText('landing_welcome_title', '🎯 미션 안내')
  const welcomeBody = useText(
    'landing_welcome_body',
    '팀을 만들어 학교 곳곳에 숨겨진 미션을 찾고\n가장 빠르게 풀어 1등을 차지하세요!',
  )

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

          <h2 className="text-lg font-bold text-text-dark">{welcomeTitle}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-text-dark/75 whitespace-pre-line">
            {welcomeBody}
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
        <footer className="mt-auto pt-10 flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-gray-400">행사 운영진 전용</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="px-4 py-2.5 rounded-2xl bg-[#FFF0E8] border-2 border-orange-main text-orange-main text-sm font-bold hover:bg-[#FFE0D0] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150"
              >
                <span className="mr-1" aria-hidden>
                  🛠
                </span>
                관리자
              </button>
              <button
                type="button"
                onClick={() => navigate('/operator')}
                className="px-4 py-2.5 rounded-2xl bg-[#E8F5EC] border-2 border-[#4CAF7F] text-[#4CAF7F] text-sm font-bold hover:bg-[#D0EBD8] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150"
              >
                <span className="mr-1" aria-hidden>
                  ✋
                </span>
                운영자
              </button>
            </div>
          </div>
          <p className="text-[11px] font-medium text-text-dark/40 text-center">
            {footerText}
          </p>
        </footer>
      </div>
    </div>
  )
}
