import { supabase } from './supabase'
import type { Quiz } from './quizTypes'
import type { SurveyQuestion, SurveyResponse } from './surveyTypes'

export interface ReportTeam {
  id: string
  team_name: string
  start_order: number | null
  member_count: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface ReportTeamMember {
  id: string
  team_id: string
  name: string
  created_at: string
}

export interface ReportAnswer {
  team_id: string
  quiz_id: string
  is_correct: boolean
  answered_at: string | null
  submitted: string
}

export interface MissionStat {
  quiz: Quiz
  correctCount: number
  attemptCount: number
  correctRate: number // 0..1
}

export interface TeamRanked {
  team: ReportTeam
  correctCount: number
  totalQuizzes: number
  pct: number
  rank: number
  elapsedSec: number | null
  lastActivity: string | null
}

export interface SurveyRatingStat {
  question: SurveyQuestion
  count: number
  avg: number | null
  distribution: number[] // index 0=1점, ... 4=5점
}

export interface SurveyChoiceStat {
  question: SurveyQuestion
  count: number
  buckets: { choice: string; count: number; pct: number }[]
}

export interface SurveyTextSample {
  question: SurveyQuestion
  texts: string[]
}

export interface ReportData {
  fetchedAt: Date
  teams: ReportTeam[]
  members: ReportTeamMember[]
  quizzes: Quiz[]
  answers: ReportAnswer[]
  survey: {
    questions: SurveyQuestion[]
    responses: SurveyResponse[]
  }
  // 파생 통계
  basic: {
    totalTeams: number
    startedTeams: number
    finishedTeams: number
    totalMembers: number
    activeQuizCount: number
    goalRatePct: number // 목표 달성률(=완료팀/전체팀)
    avgElapsedSec: number | null
    avgCorrect: number
    avgCorrectPct: number
  }
  missionStats: MissionStat[]
  hardestTop3: MissionStat[]
  easiestTop3: MissionStat[]
  rankings: TeamRanked[]
  surveyStats: {
    questionCount: number
    respondentCount: number // 고유 (team_id, respondent_name) 쌍 수
    responseCount: number
    responseRate: number // respondent / totalMembers (0..1)
    ratings: SurveyRatingStat[]
    choices: SurveyChoiceStat[]
    texts: SurveyTextSample[]
  }
}

function elapsedSec(t: ReportTeam): number | null {
  if (!t.started_at || !t.finished_at) return null
  const ms = new Date(t.finished_at).getTime() - new Date(t.started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 1000)
}

export async function fetchReportData(): Promise<ReportData> {
  const [teamsRes, membersRes, quizzesRes, answersRes, sqRes, srRes] =
    await Promise.all([
      supabase
        .from('tanggo_teams')
        .select(
          'id, team_name, start_order, member_count, started_at, finished_at, created_at',
        ),
      supabase
        .from('tanggo_team_members')
        .select('id, team_id, name, created_at'),
      supabase
        .from('tanggo_quizzes')
        .select('*')
        .order('order_num', { ascending: true }),
      supabase
        .from('tanggo_answers')
        .select('team_id, quiz_id, is_correct, answered_at, submitted'),
      supabase
        .from('tanggo_survey_questions')
        .select('*')
        .order('order_num', { ascending: true }),
      supabase.from('tanggo_survey_responses').select('*'),
    ])

  const firstErr =
    teamsRes.error ||
    membersRes.error ||
    quizzesRes.error ||
    answersRes.error ||
    sqRes.error ||
    srRes.error
  if (firstErr) throw new Error(firstErr.message)

  const teams = (teamsRes.data ?? []) as ReportTeam[]
  const members = (membersRes.data ?? []) as ReportTeamMember[]
  const quizzes = (quizzesRes.data ?? []) as Quiz[]
  const answers = (answersRes.data ?? []) as ReportAnswer[]
  const sQuestions = (sqRes.data ?? []) as SurveyQuestion[]
  const sResponses = (srRes.data ?? []) as SurveyResponse[]

  const activeQuizzes = quizzes.filter((q) => q.is_active)
  const activeQuizCount = activeQuizzes.length

  // 팀별 정답수, 마지막 활동
  const byTeam = new Map<string, { correct: number; last: string | null }>()
  for (const a of answers) {
    if (!a.is_correct) continue
    const cur = byTeam.get(a.team_id) ?? { correct: 0, last: null }
    cur.correct += 1
    if (a.answered_at && (!cur.last || a.answered_at > cur.last)) {
      cur.last = a.answered_at
    }
    byTeam.set(a.team_id, cur)
  }

  // 기본 통계
  const totalTeams = teams.length
  const startedTeams = teams.filter((t) => t.started_at).length
  const finishedTeams = teams.filter((t) => t.finished_at).length
  const totalMembers = members.length
  const goalRatePct =
    totalTeams === 0 ? 0 : Math.round((finishedTeams / totalTeams) * 100)
  const elapsedList = teams
    .map(elapsedSec)
    .filter((x): x is number => x !== null)
  const avgElapsedSec =
    elapsedList.length === 0
      ? null
      : Math.round(elapsedList.reduce((a, b) => a + b, 0) / elapsedList.length)
  const sumCorrect = teams.reduce(
    (s, t) => s + (byTeam.get(t.id)?.correct ?? 0),
    0,
  )
  const avgCorrect = totalTeams === 0 ? 0 : sumCorrect / totalTeams
  const avgCorrectPct =
    activeQuizCount === 0 ? 0 : Math.round((avgCorrect / activeQuizCount) * 100)

  // 미션별 통계
  const missionStats: MissionStat[] = activeQuizzes.map((q) => {
    const rs = answers.filter((a) => a.quiz_id === q.id)
    const attempts = rs.length
    const correct = rs.filter((a) => a.is_correct).length
    return {
      quiz: q,
      correctCount: correct,
      attemptCount: attempts,
      correctRate: totalTeams === 0 ? 0 : correct / totalTeams,
    }
  })
  const sortedByEase = [...missionStats].sort(
    (a, b) => b.correctRate - a.correctRate,
  )
  const easiestTop3 = sortedByEase.slice(0, 3)
  const hardestTop3 = [...sortedByEase].reverse().slice(0, 3)

  // 팀 순위
  const ranked: TeamRanked[] = teams
    .map((t) => {
      const c = byTeam.get(t.id)?.correct ?? 0
      const last = byTeam.get(t.id)?.last ?? null
      return {
        team: t,
        correctCount: c,
        totalQuizzes: activeQuizCount,
        pct: activeQuizCount === 0 ? 0 : Math.round((c / activeQuizCount) * 100),
        rank: 0,
        elapsedSec: elapsedSec(t),
        lastActivity: last,
      }
    })
    .sort((a, b) => {
      if (b.correctCount !== a.correctCount) {
        return b.correctCount - a.correctCount
      }
      const aT = a.team.finished_at ?? a.lastActivity ?? '￿'
      const bT = b.team.finished_at ?? b.lastActivity ?? '￿'
      return aT.localeCompare(bT)
    })
  ranked.forEach((r, i) => (r.rank = i + 1))

  // 설문 통계
  const activeQuestions = sQuestions.filter((q) => q.is_active)
  const respondentSet = new Set<string>()
  for (const r of sResponses) {
    respondentSet.add(`${r.team_id}__${r.respondent_name ?? ''}`)
  }
  const respondentCount = respondentSet.size
  const responseRate =
    totalMembers === 0 ? 0 : Math.min(1, respondentCount / totalMembers)

  const ratings: SurveyRatingStat[] = []
  const choices: SurveyChoiceStat[] = []
  const texts: SurveyTextSample[] = []

  for (const q of activeQuestions) {
    const rs = sResponses.filter((r) => r.question_id === q.id)
    if (q.question_type === 'rating') {
      const nums = rs
        .map((r) => r.answer_number)
        .filter((x): x is number => x !== null)
      const dist = [0, 0, 0, 0, 0]
      for (const n of nums) {
        if (n >= 1 && n <= 5) dist[n - 1]++
      }
      const avg =
        nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length
      ratings.push({
        question: q,
        count: nums.length,
        avg,
        distribution: dist,
      })
    } else if (q.question_type === 'single_choice' || q.question_type === 'multi_choice') {
      const counts = new Map<string, number>()
      let total = 0
      for (const r of rs) {
        const cs = r.answer_choices ?? (r.answer_text ? [r.answer_text] : [])
        for (const c of cs) {
          counts.set(c, (counts.get(c) ?? 0) + 1)
          total++
        }
      }
      const buckets = (q.choices ?? Array.from(counts.keys()))
        .map((c) => {
          const n = counts.get(c) ?? 0
          return {
            choice: c,
            count: n,
            pct: total === 0 ? 0 : Math.round((n / total) * 100),
          }
        })
        .sort((a, b) => b.count - a.count)
      choices.push({ question: q, count: rs.length, buckets })
    } else {
      texts.push({
        question: q,
        texts: rs
          .map((r) => (r.answer_text ?? '').trim())
          .filter(Boolean),
      })
    }
  }

  return {
    fetchedAt: new Date(),
    teams,
    members,
    quizzes,
    answers,
    survey: { questions: sQuestions, responses: sResponses },
    basic: {
      totalTeams,
      startedTeams,
      finishedTeams,
      totalMembers,
      activeQuizCount,
      goalRatePct,
      avgElapsedSec,
      avgCorrect: Math.round(avgCorrect * 10) / 10,
      avgCorrectPct,
    },
    missionStats,
    hardestTop3,
    easiestTop3,
    rankings: ranked,
    surveyStats: {
      questionCount: activeQuestions.length,
      respondentCount,
      responseCount: sResponses.length,
      responseRate,
      ratings,
      choices,
      texts,
    },
  }
}

export function formatElapsed(sec: number | null): string {
  if (sec === null) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}시간 ${pad(m)}분 ${pad(s)}초`
  return `${m}분 ${pad(s)}초`
}
