import * as XLSX from 'xlsx'
import { SEASON_CONFIG } from '../config/seasonConfig'
import { APP_CONFIG } from '../config/appConfig'
import type { ReportData } from './reportData'
import { formatElapsed } from './reportData'
import { SURVEY_TYPE_LABEL } from './surveyTypes'

function todayKor(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function typeLabel(t: string, sub: string | null | undefined): string {
  if (t === 'text') return '주관식'
  if (t === 'choice') return '객관식'
  if (t === 'mission') {
    if (sub === 'video') return '현장(영상)'
    if (sub === 'photo') return '현장(사진)'
    if (sub === 'verify') return '현장(인증)'
    return '현장'
  }
  return t
}

export function exportReportExcel(data: ReportData, filename: string): void {
  const wb = XLSX.utils.book_new()
  const b = data.basic

  // 시트1: 행사 개요
  const overviewRows: (string | number)[][] = [
    ['항목', '값'],
    ['행사명', SEASON_CONFIG.seasonNameFormal],
    ['컨셉', SEASON_CONFIG.seasonDescription],
    ['일시', SEASON_CONFIG.eventDate],
    ['주최', APP_CONFIG.appOrganizer],
    ['운영 시스템', `${APP_CONFIG.appName} v${APP_CONFIG.version}`],
    ['보고서 생성', todayKor(data.fetchedAt)],
    [],
    ['등록 팀', b.totalTeams],
    ['시작 팀', b.startedTeams],
    ['완료 팀', b.finishedTeams],
    ['참여 청소년', b.totalMembers],
    ['활성 미션', b.activeQuizCount],
    ['목표 달성률(%)', b.goalRatePct],
    ['평균 정답 미션', b.avgCorrect],
    ['평균 진행률(%)', b.avgCorrectPct],
    ['평균 소요 시간', formatElapsed(b.avgElapsedSec)],
    ['설문 응답자', data.surveyStats.respondentCount],
    ['설문 응답률(%)', Math.round(data.surveyStats.responseRate * 100)],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(overviewRows)
  ws1['!cols'] = [{ wch: 22 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, ws1, '행사_개요')

  // 시트2: 팀 명단 (순위 기준)
  const teamRows: (string | number)[][] = [
    ['순위', '팀 이름', '인원', '정답', '진행률(%)', '시작 시각', '완료 시각', '소요 시간', '상태'],
  ]
  for (const r of data.rankings) {
    const status = r.team.finished_at
      ? '완료'
      : r.team.started_at
        ? '진행 중'
        : '시작 전'
    teamRows.push([
      r.rank,
      r.team.team_name,
      r.team.member_count ?? '',
      r.correctCount,
      r.pct,
      r.team.started_at ? formatHM(r.team.started_at) : '',
      r.team.finished_at ? formatHM(r.team.finished_at) : '',
      formatElapsed(r.elapsedSec),
      status,
    ])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(teamRows)
  ws2['!cols'] = [
    { wch: 6 },
    { wch: 20 },
    { wch: 6 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, '팀_명단')

  // 시트3: 팀원 명단
  const teamById = new Map(data.teams.map((t) => [t.id, t.team_name]))
  const memberRows: (string | number)[][] = [['팀 이름', '이름', '가입 시각']]
  for (const m of [...data.members].sort((a, b) => {
    const tn = (teamById.get(a.team_id) ?? '').localeCompare(
      teamById.get(b.team_id) ?? '',
    )
    if (tn !== 0) return tn
    return a.created_at.localeCompare(b.created_at)
  })) {
    memberRows.push([
      teamById.get(m.team_id) ?? '(알 수 없음)',
      m.name,
      formatHM(m.created_at),
    ])
  }
  const ws3 = XLSX.utils.aoa_to_sheet(memberRows)
  ws3['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws3, '팀원_명단')

  // 시트4: 미션 결과
  const missionRows: (string | number)[][] = [
    ['#', '유형', '미션', '위치 힌트', '정답팀', '전체팀', '정답률(%)'],
  ]
  for (const m of data.missionStats) {
    missionRows.push([
      m.quiz.order_num,
      typeLabel(m.quiz.type, m.quiz.mission_subtype),
      m.quiz.question,
      m.quiz.location_hint ?? '',
      m.correctCount,
      b.totalTeams,
      Math.round(m.correctRate * 100),
    ])
  }
  const ws4 = XLSX.utils.aoa_to_sheet(missionRows)
  ws4['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 40 },
    { wch: 24 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws4, '미션_결과')

  // 시트5: 설문 응답 (요약 + 개별 응답을 한 시트에)
  const surveyRows: (string | number)[][] = [
    ['질문 응답 요약'],
    ['#', '유형', '질문', '응답 수', '요약'],
  ]
  for (const q of data.survey.questions) {
    const rs = data.survey.responses.filter((r) => r.question_id === q.id)
    let summary = ''
    if (q.question_type === 'rating') {
      const nums = rs
        .map((r) => r.answer_number)
        .filter((x): x is number => x !== null)
      if (nums.length > 0) {
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length
        summary = `평균 ${avg.toFixed(2)} / 5`
      }
    } else if (
      q.question_type === 'single_choice' ||
      q.question_type === 'multi_choice'
    ) {
      const counts = new Map<string, number>()
      for (const r of rs) {
        for (const c of r.answer_choices ?? []) {
          counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      }
      summary = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c}(${n})`)
        .join(', ')
    } else {
      summary = `텍스트 응답 ${rs.length}건`
    }
    surveyRows.push([
      q.order_num,
      SURVEY_TYPE_LABEL[q.question_type],
      q.question,
      rs.length,
      summary,
    ])
  }
  surveyRows.push([])
  surveyRows.push(['개별 응답'])
  const detailHeader: string[] = ['팀 이름', '응답자']
  const sortedQ = [...data.survey.questions].sort(
    (a, b) => a.order_num - b.order_num,
  )
  for (const q of sortedQ) {
    detailHeader.push(`Q${q.order_num}. ${q.question}`)
  }
  surveyRows.push(detailHeader)
  type RowKey = string
  const grouped = new Map<RowKey, typeof data.survey.responses>()
  for (const r of data.survey.responses) {
    const key = `${r.team_id}__${r.respondent_name ?? ''}`
    const arr = grouped.get(key) ?? []
    arr.push(r)
    grouped.set(key, arr)
  }
  for (const [, rs] of grouped) {
    const first = rs[0]
    const row: (string | number)[] = [
      teamById.get(first.team_id) ?? '(알 수 없음)',
      first.respondent_name ?? '',
    ]
    for (const q of sortedQ) {
      const r = rs.find((x) => x.question_id === q.id)
      if (!r) {
        row.push('')
      } else {
        switch (q.question_type) {
          case 'rating':
            row.push(r.answer_number !== null ? r.answer_number : '')
            break
          case 'short_text':
          case 'long_text':
            row.push(r.answer_text ?? '')
            break
          case 'single_choice':
            row.push(r.answer_choices?.[0] ?? r.answer_text ?? '')
            break
          case 'multi_choice':
            row.push((r.answer_choices ?? []).join(', '))
            break
        }
      }
    }
    surveyRows.push(row)
  }
  const ws5 = XLSX.utils.aoa_to_sheet(surveyRows)
  ws5['!cols'] = detailHeader.map((_, i) => ({
    wch: i === 0 ? 16 : i === 1 ? 12 : 24,
  }))
  XLSX.utils.book_append_sheet(wb, ws5, '설문_응답')

  XLSX.writeFile(wb, filename)
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
