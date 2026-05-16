import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SEEN_KEY = 'tanggo_announce_seen_at'

interface Announcement {
  title: string | null
  body: string | null
  updated_at: string | null
}

function readSeen(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SEEN_KEY)
}

function writeSeen(iso: string | null) {
  if (!iso) return
  localStorage.setItem(SEEN_KEY, iso)
}

export default function AnnouncementBanner() {
  const [ann, setAnn] = useState<Announcement | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [seenAt, setSeenAt] = useState<string | null>(readSeen())

  useEffect(() => {
    let active = true

    async function load() {
      const { data } = await supabase
        .from('tanggo_event_config')
        .select('announcement_title, announcement_body, announcement_updated_at')
        .eq('id', 1)
        .maybeSingle()
      if (!active || !data) return
      setAnn({
        title: data.announcement_title,
        body: data.announcement_body,
        updated_at: data.announcement_updated_at,
      })
    }

    load()

    const channel = supabase
      .channel('event-config-announcement')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'tanggo',
          table: 'tanggo_event_config',
          filter: 'id=eq.1',
        },
        (payload) => {
          if (!active) return
          const row = payload.new as {
            announcement_title: string | null
            announcement_body: string | null
            announcement_updated_at: string | null
          }
          setAnn({
            title: row.announcement_title,
            body: row.announcement_body,
            updated_at: row.announcement_updated_at,
          })
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  // 새 공지 도착 시 팝업 트리거
  useEffect(() => {
    if (!ann?.updated_at) {
      setShowPopup(false)
      return
    }
    const hasContent = !!(ann.title || ann.body)
    if (!hasContent) {
      setShowPopup(false)
      return
    }
    if (!seenAt || ann.updated_at > seenAt) {
      setShowPopup(true)
    }
  }, [ann, seenAt])

  function dismissPopup() {
    if (ann?.updated_at) {
      writeSeen(ann.updated_at)
      setSeenAt(ann.updated_at)
    }
    setShowPopup(false)
  }

  if (!ann) return null
  const hasContent = !!(ann.title || ann.body)
  if (!hasContent) return null

  return (
    <>
      {/* 상단 띠 */}
      <div
        className="border-b-2 border-[#FFD93D] bg-[#FFF8DC]"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2 text-left"
          aria-expanded={expanded}
        >
          <span className="text-base shrink-0" aria-hidden>
            📢
          </span>
          <span className="flex-1 truncate text-sm font-bold text-[#7a5e00]">
            {ann.title || ann.body}
          </span>
          <span
            aria-hidden
            className={`text-[#7a5e00]/60 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </button>
        {expanded && (
          <div className="px-4 pb-3 pt-1 text-sm text-[#7a5e00] whitespace-pre-wrap">
            {ann.title && <p className="font-bold">{ann.title}</p>}
            {ann.body && <p className={ann.title ? 'mt-1' : ''}>{ann.body}</p>}
          </div>
        )}
      </div>

      {/* 새 공지 팝업 */}
      {showPopup && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={dismissPopup}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl border-4 border-[#FFD93D] px-6 pt-8 pb-5"
            style={{ boxShadow: '0 12px 30px -8px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-5xl" aria-hidden>
                📢
              </div>
              <span className="inline-block mt-3 px-2.5 py-0.5 rounded-full bg-[#FFF8DC] text-[#7a5e00] text-[11px] font-bold">
                공지사항
              </span>
              {ann.title && (
                <h2 className="mt-3 text-lg font-black text-text-dark">
                  {ann.title}
                </h2>
              )}
              {ann.body && (
                <p className="mt-2 text-sm text-text-dark/80 whitespace-pre-wrap leading-relaxed">
                  {ann.body}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={dismissPopup}
              className="mt-5 w-full rounded-2xl bg-orange-main py-3 text-base font-bold text-white hover:bg-orange-sub"
              style={{ boxShadow: 'var(--shadow-orange-sm)' }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  )
}
