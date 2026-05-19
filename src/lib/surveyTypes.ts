export type SurveyQuestionType =
  | 'rating'
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multi_choice'

export interface SurveyQuestion {
  id: string
  order_num: number
  question_type: SurveyQuestionType
  question: string
  description: string | null
  is_required: boolean
  choices: string[] | null
  is_active: boolean
  created_at: string
}

export interface SurveyQuestionInput {
  order_num: number
  question_type: SurveyQuestionType
  question: string
  description: string | null
  is_required: boolean
  choices: string[] | null
  is_active: boolean
}

export interface SurveyResponse {
  id: string
  team_id: string
  question_id: string
  respondent_name: string | null
  answer_text: string | null
  answer_number: number | null
  answer_choices: string[] | null
  created_at: string
}

export interface SurveyResponseInput {
  team_id: string
  question_id: string
  respondent_name: string | null
  answer_text: string | null
  answer_number: number | null
  answer_choices: string[] | null
}

export const SURVEY_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  rating: '별점',
  short_text: '한 줄 답변',
  long_text: '장문 답변',
  single_choice: '객관식 (단일)',
  multi_choice: '객관식 (다중)',
}

export const SURVEY_TYPE_SHORT: Record<SurveyQuestionType, string> = {
  rating: '별점',
  short_text: '한 줄',
  long_text: '장문',
  single_choice: '단일',
  multi_choice: '다중',
}

export const SURVEY_TYPE_EMOJI: Record<SurveyQuestionType, string> = {
  rating: '⭐',
  short_text: '✏️',
  long_text: '📝',
  single_choice: '🔘',
  multi_choice: '☑',
}

export const SURVEY_TYPE_BADGE: Record<SurveyQuestionType, string> = {
  rating: 'bg-yellow-100 text-yellow-800',
  short_text: 'bg-gray-100 text-gray-700',
  long_text: 'bg-gray-200 text-gray-800',
  single_choice: 'bg-blue-100 text-blue-700',
  multi_choice: 'bg-purple-100 text-purple-700',
}

export function hasChoices(t: SurveyQuestionType): boolean {
  return t === 'single_choice' || t === 'multi_choice'
}
