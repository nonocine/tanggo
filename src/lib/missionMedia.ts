import { supabase } from './supabase'

export const MISSION_MEDIA_BUCKET = 'tanggo-mission-media'
export const MAX_MISSION_MEDIA_BYTES = 50 * 1024 * 1024 // 50MB

export type MediaType = 'video' | 'photo'

export interface UploadResult {
  url: string
  path: string
}

function extOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name)
  if (m) return m[1].toLowerCase()
  if (file.type.startsWith('video/')) return file.type.split('/')[1] || 'mp4'
  if (file.type.startsWith('image/')) return file.type.split('/')[1] || 'jpg'
  return 'bin'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export async function uploadMissionMedia(
  file: File,
  teamId: string,
  quizId: string,
): Promise<UploadResult> {
  const ext = extOf(file)
  const path = `${teamId}_${quizId}_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(MISSION_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })
  if (error) throw error
  const { data } = supabase.storage.from(MISSION_MEDIA_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}
