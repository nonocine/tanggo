import { useState } from 'react'
import type { ReferenceImage } from '../lib/quizTypes'

/**
 * 문제 참고 이미지 뷰어 — 가로 스크롤 썸네일 + 탭하면 전체화면.
 * 참가자 미션 화면(1일차 Mission, 2일차 MissionSlot)과
 * 관리자 QuizFormModal 미리보기에서 공용으로 쓴다.
 */
export default function ReferenceImages({ images }: { images: ReferenceImage[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const open = openIdx !== null ? images[openIdx] : null

  if (images.length === 0) return null

  function markFailed(key: string) {
    setFailed((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-text-dark/60 mb-1.5">
        🖼 참고 이미지 (탭하면 크게 보기)
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {images.map((img, idx) => {
          const key = `${img.url}-${idx}`
          const broken = failed.has(key)

          const inner = (
            <>
              {broken ? (
                <span className="flex w-full h-20 items-center justify-center bg-text-dark/10 px-1 text-center text-[10px] font-bold leading-tight text-text-dark/50">
                  이미지를 불러올 수 없어요
                </span>
              ) : (
                <img
                  src={img.url}
                  alt={img.label || `참고 이미지 ${idx + 1}`}
                  loading="lazy"
                  onError={() => markFailed(key)}
                  className="w-full h-20 object-cover bg-black"
                />
              )}
              {img.label && (
                <span className="block px-1 py-1 text-[10px] font-bold text-text-dark/70 truncate">
                  {img.label}
                </span>
              )}
            </>
          )

          // 깨진 이미지는 확대해도 보이지 않으므로 탭 대상에서 제외한다
          return broken ? (
            <div
              key={key}
              className="shrink-0 w-24 rounded-xl overflow-hidden border-2 border-text-dark/10 bg-white"
            >
              {inner}
            </div>
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => setOpenIdx(idx)}
              className="shrink-0 w-24 rounded-xl overflow-hidden border-2 border-text-dark/10 bg-white hover:border-orange-main transition-colors"
            >
              {inner}
            </button>
          )
        })}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setOpenIdx(null)}
        >
          <div className="max-w-full max-h-full">
            <img
              src={open.url}
              alt={open.label || '참고 이미지'}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            {open.label && (
              <p className="mt-3 text-center text-sm font-bold text-white">
                {open.label}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpenIdx(null)}
            aria-label="닫기"
            className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 text-text-dark text-2xl"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
