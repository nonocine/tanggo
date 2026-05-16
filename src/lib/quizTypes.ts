export type QuizType = 'text' | 'choice' | 'mission'

export interface Quiz {
  id: string
  order_num: number
  type: QuizType
  question: string
  location_hint: string | null
  choices: string[] | null
  answer: string | null
  answer_variants: string[] | null
  hint: string | null
  is_active: boolean
  created_at: string
}

export interface QuizInput {
  order_num: number
  type: QuizType
  question: string
  location_hint: string | null
  choices: string[] | null
  answer: string | null
  answer_variants: string[] | null
  hint: string | null
  is_active: boolean
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
