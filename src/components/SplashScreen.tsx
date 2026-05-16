import { APP_CONFIG } from '../config/appConfig'
import MainTitle from './MainTitle'
import SeasonTitle from './SeasonTitle'

export default function SplashScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-[#FFF8E7] via-[#FFE8DD] to-[#FFD8C2]">
      <div className="flex flex-col items-center px-6 text-center">
        <img
          src="/logo1.png"
          alt={`${APP_CONFIG.appName} 로고`}
          className="max-w-xs w-full h-auto animate-splash-rise drop-shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
        />
        <div className="mt-4 animate-splash-rise">
          <MainTitle size="lg" />
        </div>
        <div className="mt-3 animate-splash-fade">
          <SeasonTitle />
        </div>
        <p className="mt-3 text-base font-medium text-text-dark/60 animate-splash-fade">
          {APP_CONFIG.appSlogan}
        </p>
      </div>
    </div>
  )
}
