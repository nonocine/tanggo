import { useEffect, useRef, useState } from 'react'

/* ── 조정 포인트 ──────────────────────────────────────────
   팝업이 떠 있는 시간, 파티클 개수/크기/색은 모두 아래 상수로 모았다.
   애니메이션 타이밍(폭죽 900ms, 캐릭터 팝 480ms, 빛줄기 회전 8s)은
   src/styles/tokens.css 의 --animate-celebrate-* 토큰에 있다. */

/** 팝업이 떠 있는 시간 — 이후 페이드아웃 시작 */
const AUTO_CLOSE_MS = 2200
/** 닫힐 때 페이드아웃 시간 */
const FADE_OUT_MS = 160
/** 폭죽 조각 개수 */
const PARTICLE_COUNT = 28
/** 캐릭터 지름(px) */
const CHAR_SIZE = 180
/** 빛줄기 크기 = 캐릭터 지름 x 이 배수 */
const RAY_SCALE = 2.2
/** 빛줄기 갈래 수 */
const RAY_COUNT = 12
/** 폭죽이 뻗어나가는 거리(px) 최소~최대 */
const BURST_MIN = 120
const BURST_MAX = 260
/** 폭죽 조각 크기(px) 최소~최대 */
const SIZE_MIN = 6
const SIZE_MAX = 14

const PARTICLE_COLORS = [
  '#FF6B47', // 오렌지
  '#FFD93D', // 노랑
  '#4CAF7F', // 민트
  '#ECBE64', // 금색
  '#FFFFFF', // 흰색
]

const RAY_SIZE = Math.round(CHAR_SIZE * RAY_SCALE)
/** 한 갈래가 차지하는 각도 */
const RAY_STEP = 360 / RAY_COUNT
/** 빛줄기 한 갈래의 두께 (갈래 간격의 비율) */
const RAY_THICKNESS = RAY_STEP * 0.24

/** 캐릭터 이미지 — webp 실패 시 정지 이미지로 폴백 */
const CHAR_WEBP = '/wave.webp'
const CHAR_POSTER = '/wave-poster.jpg'

const RAY_MASK =
  'radial-gradient(circle, #000 18%, rgba(0,0,0,0.55) 45%, transparent 72%)'

interface Particle {
  x: number
  y: number
  rot: number
  size: number
  color: string
  radius: string
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2
    const dist = BURST_MIN + Math.random() * (BURST_MAX - BURST_MIN)
    return {
      x: Math.round(Math.cos(angle) * dist),
      y: Math.round(Math.sin(angle) * dist),
      rot: Math.round((Math.random() - 0.5) * 720),
      size: Math.round(SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN)),
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      // 사각형과 원을 섞는다
      radius: Math.random() < 0.5 ? '50%' : `${Math.round(Math.random() * 3)}px`,
    }
  })
}

export interface SubmitCelebrationProps {
  open: boolean
  onClose: () => void
  message?: string
  submessage?: string
}

export default function SubmitCelebration({
  open,
  onClose,
  message = '제출 완료!',
  submessage = '장영실이 칭찬해요',
}: SubmitCelebrationProps) {
  const [closing, setClosing] = useState(false)
  const [charSrc, setCharSrc] = useState(CHAR_WEBP)
  const [charBroken, setCharBroken] = useState(false)
  // 열릴 때 한 번만 계산 — 리렌더로 파티클이 튀지 않게
  const [particles, setParticles] = useState<Particle[]>(makeParticles)

  // open 이 바뀌는 순간 렌더 중에 상태를 맞춘다 (effect 로 하면 한 프레임 늦는다)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    setClosing(false)
    if (open) {
      setCharSrc(CHAR_WEBP)
      setCharBroken(false)
      setParticles(makeParticles())
    }
  }

  // onClose 가 인라인 화살표로 넘어와도 타이머가 재시작되지 않도록 ref 로 잡는다
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const timersRef = useRef<number[]>([])

  // 자동 닫기 — AUTO_CLOSE_MS 뒤 페이드아웃 시작, 끝나면 onClose
  useEffect(() => {
    if (!open) return
    const timers = timersRef.current
    timers.length = 0
    timers.push(
      window.setTimeout(() => setClosing(true), AUTO_CLOSE_MS),
      window.setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS + FADE_OUT_MS),
    )
    // 언마운트 / open 변경 시 반드시 정리 (메모리 누수 방지).
    // dismiss() 가 새로 넣은 타이머도 같은 배열이므로 함께 정리된다.
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.length = 0
    }
  }, [open])

  /** 탭하면 즉시 페이드아웃 후 닫기 */
  function dismiss() {
    if (closing) return
    const timers = timersRef.current
    for (const t of timers) clearTimeout(t)
    timers.length = 0
    setClosing(true)
    timers.push(window.setTimeout(() => onCloseRef.current(), FADE_OUT_MS))
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={`${message} ${submessage}`}
      onClick={dismiss}
      className={`fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/55 ${
        closing ? 'animate-celebrate-dim-out' : 'animate-celebrate-dim-in'
      }`}
    >
      <div className="flex flex-col items-center">
        {/* 캐릭터 + 빛줄기 + 폭죽이 같은 중심을 쓰도록 묶는다 */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: CHAR_SIZE, height: CHAR_SIZE }}
        >
          {/* 2) 빛줄기 — 바깥으로 갈수록 radial 마스크로 사라진다.
                 scale 등장(바깥)과 무한 회전(안쪽)을 나눠야 transform 이 안 겹친다 */}
          <div
            aria-hidden
            className="pointer-events-none absolute animate-celebrate-rays-in motion-reduce:animate-none"
            style={{
              width: RAY_SIZE,
              height: RAY_SIZE,
              left: (CHAR_SIZE - RAY_SIZE) / 2,
              top: (CHAR_SIZE - RAY_SIZE) / 2,
              opacity: 0.55,
            }}
          >
            <div
              className="h-full w-full animate-celebrate-rays-spin motion-reduce:animate-none"
              style={{
                background: `repeating-conic-gradient(from 0deg, rgba(236,190,100,0.95) 0deg ${RAY_THICKNESS}deg, rgba(236,190,100,0) ${RAY_THICKNESS}deg ${RAY_STEP}deg)`,
                maskImage: RAY_MASK,
                WebkitMaskImage: RAY_MASK,
              }}
            />
          </div>

          {/* 3) 폭죽 파티클 — 중앙(0,0)에서 사방으로 */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 motion-reduce:hidden"
          >
            {particles.map((p, i) => (
              <span
                key={i}
                className="absolute block animate-celebrate-burst"
                style={
                  {
                    width: p.size,
                    height: p.size,
                    marginLeft: -p.size / 2,
                    marginTop: -p.size / 2,
                    backgroundColor: p.color,
                    borderRadius: p.radius,
                    '--burst-x': `${p.x}px`,
                    '--burst-y': `${p.y}px`,
                    '--burst-rot': `${p.rot}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>

          {/* 4) 캐릭터 */}
          {charBroken ? (
            <div
              aria-hidden
              className="relative flex items-center justify-center rounded-full bg-cream text-6xl animate-celebrate-pop motion-reduce:animate-none"
              style={{
                width: CHAR_SIZE,
                height: CHAR_SIZE,
                border: '4px solid #ECBE64',
              }}
            >
              🎉
            </div>
          ) : (
            <img
              src={charSrc}
              alt="장영실이 손을 흔들며 축하하고 있어요"
              className="relative animate-celebrate-pop motion-reduce:animate-none"
              style={{
                width: CHAR_SIZE,
                height: CHAR_SIZE,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '4px solid #ECBE64',
              }}
              onError={() => {
                // webp 실패 → 정지 이미지 폴백 → 그래도 실패하면 이모지
                if (charSrc !== CHAR_POSTER) setCharSrc(CHAR_POSTER)
                else setCharBroken(true)
              }}
            />
          )}
        </div>

        {/* 5) 텍스트 — 캐릭터보다 120ms 늦게 아래에서 올라온다 */}
        <div className="mt-6 px-6 text-center animate-celebrate-text-rise motion-reduce:animate-none">
          <p
            className="text-[28px] font-black leading-tight text-white"
            style={{ textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
          >
            {message}
          </p>
          <p
            className="mt-1.5 text-[15px] font-semibold text-white/80"
            style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}
          >
            {submessage}
          </p>
        </div>
      </div>
    </div>
  )
}
