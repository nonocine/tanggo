export type QuizType = 'text' | 'choice' | 'mission'
export type MissionSubtype = 'video' | 'photo' | 'verify' | 'photo_with_text'

export interface ReferenceImage {
  label: string
  url: string
}

export interface Quiz {
  id: string
  order_num: number
  type: QuizType
  mission_subtype: MissionSubtype | null
  question: string
  location_hint: string | null
  choices: string[] | null
  answer: string | null
  answer_variants: string[] | null
  hint: string | null
  is_active: boolean
  created_at: string
  day_number: number | null
  location_group: string | null
  location_group_order: number | null
  slot_order: number
  requires_approval_to_proceed: boolean
  reference_images: ReferenceImage[] | null
}

export interface QuizInput {
  order_num: number
  type: QuizType
  mission_subtype: MissionSubtype | null
  question: string
  location_hint: string | null
  choices: string[] | null
  answer: string | null
  answer_variants: string[] | null
  hint: string | null
  is_active: boolean
  // 멀티 데이 / 장소별 미션용 (미지정 시 DB 기본값 사용 — 기존 저장 로직이 덮어쓰지 않도록 선택 필드)
  day_number?: number | null
  location_group?: string | null
  location_group_order?: number | null
  slot_order?: number
  requires_approval_to_proceed?: boolean
  reference_images?: ReferenceImage[] | null
}

export const QUIZ_TYPE_LABEL: Record<QuizType, string> = {
  text: '주관식',
  choice: '객관식',
  mission: '현장 미션',
}

export const QUIZ_TYPE_EMOJI: Record<QuizType, string> = {
  text: '🔤',
  choice: '🔘',
  mission: '🎬',
}

export const QUIZ_TYPE_BADGE: Record<QuizType, string> = {
  text: 'bg-blue-100 text-blue-700',
  choice: 'bg-yellow-100 text-yellow-800',
  mission: 'bg-green-100 text-green-700',
}

export const MISSION_SUBTYPE_LABEL: Record<MissionSubtype, string> = {
  video: '영상 업로드',
  photo: '사진 업로드',
  verify: '직접 인증',
  photo_with_text: '사진 + 이름',
}

export const MISSION_SUBTYPE_SHORT: Record<MissionSubtype, string> = {
  video: '영상',
  photo: '사진',
  verify: '인증',
  photo_with_text: '사진+이름',
}

export const MISSION_SUBTYPE_EMOJI: Record<MissionSubtype, string> = {
  video: '📹',
  photo: '📷',
  verify: '✋',
  photo_with_text: '🏺',
}

export function missionTypeLabel(q: Pick<Quiz, 'type' | 'mission_subtype'>): string {
  if (q.type !== 'mission') return QUIZ_TYPE_LABEL[q.type]
  const sub = q.mission_subtype
  if (!sub) return '현장 미션'
  return `현장(${MISSION_SUBTYPE_SHORT[sub]})`
}
