import { useRef, useState } from 'react'

export interface EpisodePlayerProps {
  /** 영상 경로 */
  src: string
  /** 재생 전 표시할 썸네일 */
  poster: string
  /** 에피소드 제목 */
  title: string
  /** 건너뛰기 / 재생 완료 */
  onSkip: () => void
}

type Phase = 'idle' | 'playing' | 'paused' | 'error'

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function EpisodePlayer({
  src,
  poster,
  title,
  onSkip,
}: EpisodePlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  const percent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  /** 소리와 함께 재생 — 모바일은 사용자 탭이 있어야 허용된다 */
  function start() {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => setPhase('error'))
    }
  }

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      const p = v.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => setPhase('error'))
      }
    } else {
      v.pause()
    }
  }

  return (
    <section
      className="mt-4 overflow-hidden rounded-3xl border-4 border-orange-main bg-white"
      style={{ boxShadow: 'var(--shadow-orange)' }}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-2.5">
        <p className="min-w-0 truncate text-sm font-bold text-text-dark">
          📺 {title}
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-text-dark/50 hover:bg-cream hover:text-text-dark"
        >
          건너뛰기 ✕
        </button>
      </header>

      <div className="relative aspect-video w-full bg-black">
        {phase === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-bold text-white/90">
              영상을 불러올 수 없어요
            </p>
            <button
              type="button"
              onClick={onSkip}
              className="mt-3 rounded-xl border-2 border-white/40 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
            >
              건너뛰기
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={src}
              poster={poster}
              playsInline
              controls={false}
              preload="none"
              className="h-full w-full object-contain"
              onPlay={() => setPhase('playing')}
              onPause={() => {
                // 재생이 끝나서 멈춘 경우는 onEnded 가 처리한다
                const v = videoRef.current
                if (v && !v.ended) setPhase('paused')
              }}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
              onEnded={onSkip}
              onError={() => setPhase('error')}
            />

            {phase === 'idle' && (
              <button
                type="button"
                onClick={start}
                aria-label={`${title} 재생`}
                className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 pl-1 text-3xl text-orange-main shadow-lg">
                  ▶
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {(phase === 'playing' || phase === 'paused') && (
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={toggle}
            aria-label={phase === 'playing' ? '일시정지' : '이어서 재생'}
            className="shrink-0 rounded-lg px-2 py-1 text-base text-text-dark/70 hover:bg-cream hover:text-text-dark"
          >
            {phase === 'playing' ? '⏸' : '▶'}
          </button>

          <div
            role="progressbar"
            aria-label="재생 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-text-dark/10"
          >
            <div
              className="h-full rounded-full bg-orange-main transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>

          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-text-dark/50">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>
      )}
    </section>
  )
}
