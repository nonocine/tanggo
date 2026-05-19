import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const textCache = new Map<string, string>()
let allTextsLoaded = false
let loadingPromise: Promise<void> | null = null
const subscribers = new Set<() => void>()

async function loadAllTexts(): Promise<void> {
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const { data, error } = await supabase
      .from('tanggo_text_contents')
      .select('id, content')
    if (error) {
      // 실패하면 fallback만 노출되도록 캐시 비움
      loadingPromise = null
      return
    }
    if (data) {
      textCache.clear()
      for (const row of data as { id: string; content: string | null }[]) {
        if (row.content !== null && row.content !== undefined) {
          textCache.set(row.id, row.content)
        }
      }
    }
    allTextsLoaded = true
    subscribers.forEach((fn) => fn())
  })()
  return loadingPromise
}

/** 앱 시작 시 1회 호출 */
export function initTextContents(): void {
  if (!allTextsLoaded) void loadAllTexts()
}

/** id에 해당하는 텍스트. 캐시에 없으면 fallback. */
export function useText(id: string, fallback: string = ''): string {
  const [, forceRender] = useState({})

  useEffect(() => {
    if (allTextsLoaded) return
    const sub = () => forceRender({})
    subscribers.add(sub)
    void loadAllTexts()
    return () => {
      subscribers.delete(sub)
    }
  }, [])

  const value = textCache.get(id)
  return value !== undefined && value !== '' ? value : fallback
}

/** 관리자 수정 후 강제 새로고침 */
export async function refreshTextContents(): Promise<void> {
  textCache.clear()
  allTextsLoaded = false
  loadingPromise = null
  await loadAllTexts()
}
