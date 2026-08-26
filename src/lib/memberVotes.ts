import { supabase } from './supabase'

export interface MemberVoteRow {
  id: string
  team_id: string
  quiz_id: string
  member_name: string
  selected_answer: string
  voted_at: string
}

/** 내 답 선택/변경 (upsert) — 실패 시 throw */
export async function upsertMyVote(
  teamId: string,
  quizId: string,
  memberName: string,
  selectedAnswer: string,
): Promise<void> {
  const { error } = await supabase.from('tanggo_member_votes').upsert(
    {
      team_id: teamId,
      quiz_id: quizId,
      member_name: memberName,
      selected_answer: selectedAnswer,
      voted_at: new Date().toISOString(),
    },
    { onConflict: 'team_id,quiz_id,member_name' },
  )
  if (error) throw error
}

/** 특정 문제의 팀 전체 투표 현황 조회 */
export async function fetchVotesForQuiz(
  teamId: string,
  quizId: string,
): Promise<MemberVoteRow[]> {
  const { data } = await supabase
    .from('tanggo_member_votes')
    .select('*')
    .eq('team_id', teamId)
    .eq('quiz_id', quizId)
  return (data ?? []) as MemberVoteRow[]
}

/** 전원 동의 여부 확인: 모든 팀원이 같은 답을 선택했는지 */
export function checkAllAgreed(
  votes: MemberVoteRow[],
  totalMembers: number,
): { agreed: boolean; answer: string | null } {
  if (votes.length < totalMembers) return { agreed: false, answer: null }
  const answers = new Set(votes.map((v) => v.selected_answer))
  if (answers.size === 1) {
    return { agreed: true, answer: [...answers][0] }
  }
  return { agreed: false, answer: null }
}
