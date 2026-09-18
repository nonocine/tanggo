import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { hasSeenSplash, markSplashSeen } from '../lib/splashSeen'

/** 영상이 안 뜰 때(로드 실패·자동재생 차단·네트워크 지연) Landing 으로 넘어가는 시간 */
const FALLBACK_MS = 2000
/** "탭하여 건너뛰기" 안내가 페이드인되는 시점 */
const SKIP_HINT_MS = 1500

export default function Splash() {
  const navigate = useNavigate()
  // 최초 렌더 시점의 값으로 고정 — 아래에서 바로 플래그를 세우기 때문
  const [alreadySeen] = useState(hasSeenSplash)
  const [playing, setPlaying] = useState(false)
  const [showSkip, setShowSkip] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const leftRef = useRef(false)

  const goLanding = useCallback(() => {
    if (leftRef.current) return
    leftRef.current = true
    navigate('/', { replace: true })
  }, [navigate])

  // 진입 즉시 플래그를 세운다 — 재생 중 새로고침해도 다시 스플래시로
  // 돌아오지 않게(리다이렉트 루프 방지)
  useEffect(() => {
    if (alreadySeen) return
    markSplashSeen()
  }, [alreadySeen])

  // 자동재생 조건을 코드로도 한 번 더 보장 (일부 브라우저는 muted 속성을
  // 프로퍼티로 직접 세팅해야 자동재생을 허용한다)
  useEffect(() => {
    if (alreadySeen) return
    const v = videoRef.current
    if (!v) return
    v.muted = true
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // 자동재생이 막히면 아래 폴백 타이머가 Landing 으로 넘겨준다
      })
    }
  }, [alreadySeen])

  // 폴백 — 2초 안에 재생이 시작되지 않으면(로드 실패/차단/지연) 그냥 넘어간다.
  // 재생이 시작되면 playing 이 바뀌며 타이머가 해제된다.
  useEffect(() => {
    if (alreadySeen || playing) return
    const t = setTimeout(goLanding, FALLBACK_MS)
    return () => clearTimeout(t)
  }, [alreadySeen, playing, goLanding])

  // 안내 문구 페이드인
  useEffect(() => {
    if (alreadySeen) return
    const t = setTimeout(() => setShowSkip(true), SKIP_HINT_MS)
    return () => clearTimeout(t)
  }, [alreadySeen])

  // 직접 /splash 로 들어왔는데 이미 본 세션이면 바로 Landing 으로
  if (alreadySeen) return <Navigate to="/" replace />

  return (
    <div
      onClick={goLanding}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#FBF4E0]"
    >
      <video
        ref={videoRef}
        src="/splash.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onPlaying={() => setPlaying(true)}
        onEnded={goLanding}
        onError={goLanding}
        className="absolute inset-0 h-full w-full object-cover"
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          goLanding()
        }}
        className={`absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/25 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-opacity duration-700 ${
          showSkip ? 'opacity-100' : 'opacity-0'
        }`}
      >
        탭하여 건너뛰기
      </button>
    </div>
  )
}
