/** 스플래시 영상은 세션당 1회만 재생한다 (src/pages/Splash.tsx) */
export const SPLASH_SEEN_KEY = 'splash_seen'

export function hasSeenSplash(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1'
  } catch {
    // 시크릿 모드 등 sessionStorage 가 막힌 환경에서는 무한 리다이렉트를
    // 피하기 위해 "이미 봤다"로 처리한다
    return true
  }
}

export function markSplashSeen(): void {
  try {
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
  } catch {
    // 저장 실패해도 스플래시 재생 자체는 문제없다
  }
}
