import { SEASON_CONFIG } from '../config/seasonConfig'
import { APP_CONFIG } from '../config/appConfig'
import { formatElapsed, type ReportData } from './reportData'

export interface NarrativeReport {
  overview: string
  participation: string
  missions: string
  teams: string
  survey: string | null
  conclusion: string
}

export const NARRATIVE_STORAGE_KEY = 'tanggo_report_narrative'

export const NARRATIVE_SECTIONS: {
  key: keyof NarrativeReport
  title: string
}[] = [
  { key: 'overview', title: '1. 행사 개요' },
  { key: 'participation', title: '2. 참여 현황' },
  { key: 'missions', title: '3. 미션 분석' },
  { key: 'teams', title: '4. 팀별 성과' },
  { key: 'survey', title: '5. 만족도 조사 결과' },
  { key: 'conclusion', title: '6. 결론 및 시사점' },
]

function pct(num: number, denom: number): number {
  if (denom === 0) return 0
  return Math.round((num / denom) * 100)
}

function buildOverview(data: ReportData): string {
  const { fetchedAt } = data
  const yyyy = fetchedAt.getFullYear()
  const eventDate = SEASON_CONFIG.eventDate
  return (
    `${yyyy}년, ${APP_CONFIG.appOrganizer}에서 「${SEASON_CONFIG.seasonNameFormal}」이 개최되었다 (행사 일정: ${eventDate}). ` +
    `본 행사는 ${SEASON_CONFIG.seasonDescription} 형식으로 기획된 청소년 협동 미션 활동으로, ` +
    `청소년들의 협동심과 문제해결 능력을 함양하고 지역 청소년 활동에 활기를 더하고자 마련되었다.`
  )
}

function buildParticipation(data: ReportData): string {
  const b = data.basic
  if (b.totalTeams === 0) {
    return '본 행사에 등록된 팀이 없어 참여 현황 분석을 생략한다.'
  }

  const parts: string[] = []
  parts.push(
    `본 행사에는 총 ${b.totalTeams}개 팀, ${b.totalMembers}명의 청소년이 참여하였으며, ` +
      `이 중 ${b.startedTeams}팀이 게임에 진입하여 ${b.finishedTeams}팀이 모든 미션을 완수하였다.`,
  )

  const goal = b.goalRatePct
  if (goal >= 90) {
    parts.push(
      `목표 대비 ${goal}%의 높은 달성률을 기록하여 청소년들의 높은 관심과 적극적인 참여를 확인할 수 있었다.`,
    )
  } else if (goal >= 70) {
    parts.push(
      `당초 목표 대비 ${goal}%의 달성률을 보였으며, 안정적인 참여가 이루어졌다고 평가된다.`,
    )
  } else if (goal > 0) {
    parts.push(
      `목표 대비 다소 낮은 ${goal}%의 달성률을 보였으나, 참여한 청소년들은 끝까지 적극적인 모습을 보였다.`,
    )
  }

  const completionRate = pct(b.finishedTeams, Math.max(1, b.startedTeams))
  if (b.startedTeams > 0) {
    if (completionRate >= 80) {
      parts.push(
        `시작한 팀 중 ${completionRate}%가 미션을 끝까지 완수하여 대부분의 팀이 모든 미션을 마치는 모습을 보였다.`,
      )
    } else if (completionRate >= 50) {
      parts.push(
        `시작한 팀의 ${completionRate}%가 모든 미션을 완료하며 절반 이상이 적극적으로 참여하였다.`,
      )
    } else {
      parts.push(
        `시작한 팀 중 ${completionRate}%만이 모든 미션을 완료하였는데, 이는 미션 난이도 및 진행 시간 조정의 필요성을 시사한다.`,
      )
    }
  }

  if (b.avgElapsedSec !== null) {
    const min = b.avgElapsedSec / 60
    if (min <= 30) {
      parts.push(
        `완료 팀의 평균 소요 시간은 ${formatElapsed(b.avgElapsedSec)}로, 우수한 팀워크 아래 빠른 시간 안에 미션을 완수하였음을 확인할 수 있다.`,
      )
    } else if (min <= 60) {
      parts.push(
        `완료 팀의 평균 소요 시간은 ${formatElapsed(b.avgElapsedSec)}로, 적절한 시간 안에 모든 활동을 마무리하였다.`,
      )
    } else {
      parts.push(
        `완료 팀의 평균 소요 시간은 ${formatElapsed(b.avgElapsedSec)}로, 충분한 시간을 들여 미션에 몰입하는 모습을 보였다.`,
      )
    }
  }

  return parts.join(' ')
}

function buildMissions(data: ReportData): string {
  const stats = data.missionStats
  if (stats.length === 0) {
    return '등록된 활성 미션이 없어 미션 분석을 생략한다.'
  }
  if (data.basic.totalTeams === 0) {
    return `총 ${stats.length}개의 미션이 준비되었으나, 참여한 팀이 없어 정답률 분석은 의미를 갖기 어렵다.`
  }

  const parts: string[] = []
  const easyCount = stats.filter((m) => m.correctRate >= 0.8).length
  const hardOnes = stats.filter((m) => m.correctRate < 0.3)
  const sortedByEase = [...stats].sort((a, b) => b.correctRate - a.correctRate)
  const easiest = sortedByEase[0]
  const hardest = sortedByEase[sortedByEase.length - 1]

  parts.push(`총 ${stats.length}개의 미션이 진행되었다.`)

  if (easyCount / stats.length >= 0.6) {
    parts.push(
      `전체 미션 중 ${easyCount}개가 80% 이상의 높은 정답률을 보여 전반적으로 난이도가 적절했다고 평가된다.`,
    )
  } else if (easyCount === 0 && stats.length > 0) {
    parts.push(
      `대다수의 미션이 80% 미만의 정답률을 기록하여 전반적인 난이도가 다소 높았던 것으로 보인다.`,
    )
  }

  if (easiest && easiest.correctRate >= 0.7) {
    parts.push(
      `가장 정답률이 높은 미션은 "${easiest.quiz.question}"(${Math.round(
        easiest.correctRate * 100,
      )}%)로, 참가자들이 쉽게 접근할 수 있는 좋은 워밍업 역할을 하였다.`,
    )
  }

  if (hardest && hardest !== easiest && hardest.correctRate < 0.5) {
    const kind = hardest.quiz.type
    const reason =
      kind === 'mission'
        ? '현장 미션 수행에 어려움을 겪었던 것으로 보인다'
        : '청소년들이 해당 주제에 대한 사전 지식이 부족했던 것으로 보인다'
    parts.push(
      `반면 "${hardest.quiz.question}" 미션의 정답률은 ${Math.round(
        hardest.correctRate * 100,
      )}%로 가장 낮게 나타났는데, ${reason}.`,
    )
  }

  if (hardOnes.length >= 2) {
    parts.push(
      `정답률이 30% 미만인 미션이 ${hardOnes.length}개로 확인되었으며, 향후 행사에서는 해당 미션의 표현 방식이나 위치 안내를 재검토할 필요가 있다.`,
    )
  }

  return parts.join(' ')
}

function buildTeams(data: ReportData): string {
  const ranked = data.rankings
  if (ranked.length === 0) {
    return '등록된 팀이 없어 팀별 성과 분석을 생략한다.'
  }
  if (data.basic.activeQuizCount === 0) {
    return `${ranked.length}개의 팀이 등록되었으나, 활성 미션이 없어 성과를 비교할 수 없다.`
  }

  const parts: string[] = []
  const top = ranked[0]
  const topScore = top.correctCount
  const tiedTop = ranked.filter((r) => r.correctCount === topScore)

  if (tiedTop.length >= 2) {
    const names = tiedTop
      .slice(0, 3)
      .map((r) => `"${r.team.team_name}"`)
      .join(', ')
    const extra = tiedTop.length > 3 ? ' 등' : ''
    parts.push(
      `총 ${ranked.length}개 팀이 미션에 참여하였으며, ${names}${extra} ${tiedTop.length}개 팀이 동률로 우수한 성과를 거두었다.`,
    )
  } else {
    const elapsedNote =
      top.elapsedSec !== null
        ? ` (소요 시간 ${formatElapsed(top.elapsedSec)})`
        : ''
    parts.push(
      `총 ${ranked.length}개 팀이 미션에 참여한 가운데, "${top.team.team_name}" 팀이 ${topScore}/${top.totalQuizzes}개 미션을 완수하며 1위를 차지하였다${elapsedNote}.`,
    )
  }

  const minPct = Math.min(...ranked.map((r) => r.pct))
  if (ranked.length >= 3 && minPct >= 60) {
    parts.push(
      `모든 팀이 ${minPct}% 이상의 진행률을 보여 행사 운영의 균형이 적절했음을 확인할 수 있다.`,
    )
  } else if (ranked.length >= 3 && minPct < 30) {
    parts.push(
      `다만 일부 팀은 ${minPct}% 수준에 머물러, 팀별 진행 격차를 줄이기 위한 운영 보완이 필요하다.`,
    )
  }

  return parts.join(' ')
}

function buildSurvey(data: ReportData): string | null {
  const s = data.surveyStats
  if (s.questionCount === 0 || s.responseCount === 0) {
    return null
  }

  const parts: string[] = []
  const respRatePct = Math.round(s.responseRate * 100)
  parts.push(
    `설문에는 ${s.respondentCount}명이 응답하여 총 ${s.responseCount}건의 의견이 수집되었다 (응답률 ${respRatePct}%).`,
  )

  const ratingsWithAvg = s.ratings.filter((r) => r.avg !== null)
  if (ratingsWithAvg.length > 0) {
    const overallAvg =
      ratingsWithAvg.reduce((acc, r) => acc + (r.avg as number), 0) /
      ratingsWithAvg.length
    if (overallAvg >= 4.5) {
      parts.push(
        `별점 평균은 ${overallAvg.toFixed(2)}/5점으로 대부분의 청소년이 매우 만족한다고 응답하였다.`,
      )
    } else if (overallAvg >= 4.0) {
      parts.push(
        `별점 평균은 ${overallAvg.toFixed(2)}/5점으로 전반적으로 만족도가 높게 나타났다.`,
      )
    } else if (overallAvg >= 3.5) {
      parts.push(
        `별점 평균은 ${overallAvg.toFixed(2)}/5점으로 보통 이상의 만족도를 보였다.`,
      )
    } else {
      parts.push(
        `별점 평균은 ${overallAvg.toFixed(2)}/5점으로, 다음 행사 운영 시 개선이 필요한 부분이 있는 것으로 나타났다.`,
      )
    }

    let satCount = 0
    let totalCount = 0
    for (const r of ratingsWithAvg) {
      satCount += (r.distribution[3] ?? 0) + (r.distribution[4] ?? 0)
      totalCount += r.count
    }
    if (totalCount > 0) {
      const satPct = Math.round((satCount / totalCount) * 100)
      if (satPct >= 80) {
        parts.push(
          `'만족' 이상 응답의 비율은 ${satPct}%로, 당초 목표였던 만족도 80% 이상을 달성하였다.`,
        )
      } else {
        parts.push(
          `'만족' 이상 응답의 비율은 ${satPct}%로, 당초 목표였던 만족도 80% 대비 ${
            80 - satPct
          }%포인트 부족하였다.`,
        )
      }
    }
  }

  if (s.choices.length > 0) {
    const top = s.choices[0]
    const topBucket = top.buckets[0]
    if (topBucket && topBucket.count > 0) {
      parts.push(
        `"${top.question.question}" 질문에서는 "${topBucket.choice}"이(가) ${topBucket.pct}%로 가장 많은 응답을 받았다.`,
      )
    }
  }

  const textTotal = s.texts.reduce((a, b) => a + b.texts.length, 0)
  if (textTotal > 0) {
    parts.push(
      `자유 의견은 총 ${textTotal}건이 수집되어 향후 행사 운영의 참고 자료로 활용할 수 있다.`,
    )
  }

  return parts.join(' ')
}

function buildConclusion(data: ReportData): string {
  const b = data.basic
  const s = data.surveyStats

  if (b.totalTeams === 0) {
    return '본 행사는 참여 팀이 없어 별도의 평가를 진행할 수 없었다. 향후에는 사전 모집 및 홍보 강화를 통해 참여를 활성화할 필요가 있다.'
  }

  const parts: string[] = []
  const goal = b.goalRatePct
  const completionRate = pct(b.finishedTeams, Math.max(1, b.startedTeams))

  let satPct: number | null = null
  const ratingsWithAvg = s.ratings.filter((r) => r.avg !== null)
  if (ratingsWithAvg.length > 0) {
    let satCount = 0
    let total = 0
    for (const r of ratingsWithAvg) {
      satCount += (r.distribution[3] ?? 0) + (r.distribution[4] ?? 0)
      total += r.count
    }
    if (total > 0) satPct = Math.round((satCount / total) * 100)
  }

  const goalOk = goal >= 70
  const completionOk = b.startedTeams === 0 || completionRate >= 60
  const satOk = satPct === null ? null : satPct >= 80
  const allOk = goalOk && completionOk && (satOk === null || satOk === true)

  if (allOk) {
    parts.push(
      `이상의 결과를 종합하면 본 행사는 참여, 진행, 만족도 측면에서 모두 양호한 결과를 보여 전반적으로 성공적으로 운영되었다고 평가할 수 있다.`,
    )
  } else {
    parts.push(
      `이상의 결과를 종합하면 본 행사는 ${
        goalOk ? '참여 목표를 달성' : '참여 목표 대비 다소 부족한 결과'
      }하였으며, ${
        completionOk ? '미션 진행도 안정적' : '미션 진행에 일부 어려움이 확인'
      }되었다.`,
    )
    if (satOk === false) {
      parts.push(
        `다만 만족도 측면에서는 향후 개선이 필요한 부분이 확인되었다.`,
      )
    }
  }

  const suggestions: string[] = []
  const hardOnes = data.missionStats.filter((m) => m.correctRate < 0.3)
  if (hardOnes.length >= 2) {
    suggestions.push('정답률이 낮은 미션에 대한 난이도 및 안내 방식 재검토')
  }
  if (b.startedTeams > 0 && completionRate < 60) {
    suggestions.push('전체 진행 시간 또는 미션 개수의 적정성 재검토')
  }
  if (satOk === false) {
    suggestions.push('만족도 향상을 위한 운영 보완')
  }
  if (b.totalTeams < 3) {
    suggestions.push('참가 팀 확대를 위한 홍보 및 모집 채널 다각화')
  }

  if (suggestions.length > 0) {
    const numbered = suggestions
      .map((x, i) => `${'①②③④⑤'[i] ?? '·'} ${x}`)
      .join(', ')
    parts.push(
      `다음 행사 운영 시에는 ${numbered} 등을 검토할 필요가 있다.`,
    )
  }

  parts.push(
    `본 행사에서 수집된 데이터와 청소년들의 의견을 바탕으로, 다음 행사를 더욱 풍성하게 기획하고자 한다.`,
  )

  return parts.join(' ')
}

export function generateNarrative(data: ReportData): NarrativeReport {
  return {
    overview: buildOverview(data),
    participation: buildParticipation(data),
    missions: buildMissions(data),
    teams: buildTeams(data),
    survey: buildSurvey(data),
    conclusion: buildConclusion(data),
  }
}

export function loadNarrativeOverrides(): Partial<NarrativeReport> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(NARRATIVE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<NarrativeReport>
    }
    return {}
  } catch {
    return {}
  }
}

export function saveNarrativeOverrides(
  overrides: Partial<NarrativeReport>,
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(NARRATIVE_STORAGE_KEY, JSON.stringify(overrides))
}

export function clearNarrativeOverrides(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(NARRATIVE_STORAGE_KEY)
}

export function mergeNarrative(
  base: NarrativeReport,
  overrides: Partial<NarrativeReport>,
): NarrativeReport {
  return {
    overview: overrides.overview ?? base.overview,
    participation: overrides.participation ?? base.participation,
    missions: overrides.missions ?? base.missions,
    teams: overrides.teams ?? base.teams,
    survey: overrides.survey !== undefined ? overrides.survey : base.survey,
    conclusion: overrides.conclusion ?? base.conclusion,
  }
}
