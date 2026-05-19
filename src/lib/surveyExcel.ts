import * as XLSX from 'xlsx'
import type {
  SurveyQuestion,
  SurveyQuestionInput,
  SurveyQuestionType,
  SurveyResponse,
} from './surveyTypes'

const HEADERS = ['순서', '유형', '질문', '설명', '필수', '선택지'] as const

const TYPE_FROM_KOR: Record<string, SurveyQuestionType> = {
  별점: 'rating',
  '한 줄': 'short_text',
  '한 줄 답변': 'short_text',
  장문: 'long_text',
  '장문 답변': 'long_text',
  단일: 'single_choice',
  '객관식 (단일)': 'single_choice',
  객관식: 'single_choice',
  다중: 'multi_choice',
  '객관식 (다중)': 'multi_choice',
  rating: 'rating',
  short_text: 'short_text',
  long_text: 'long_text',
  single_choice: 'single_choice',
  multi_choice: 'multi_choice',
}

const TYPE_TO_KOR: Record<SurveyQuestionType, string> = {
  rating: '별점',
  short_text: '한 줄',
  long_text: '장문',
  single_choice: '단일',
  multi_choice: '다중',
}

interface ParseResult {
  rows: SurveyQuestionInput[]
  errors: { row: number; message: string }[]
}

function s(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const num = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(num) ? num : null
}

function parseRequired(v: unknown): boolean {
  const str = s(v).toLowerCase()
  return str === 'y' || str === 'yes' || str === 'true' || str === '1' || str === '필수'
}

export async function parseSurveyExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { rows: [], errors: [{ row: 0, message: '시트가 비어 있어요' }] }

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const rows: SurveyQuestionInput[] = []
  const errors: { row: number; message: string }[] = []

  json.forEach((raw, i) => {
    const rowNum = i + 2
    const orderRaw = n(raw['순서'])
    const typeRaw = s(raw['유형'])
    const question = s(raw['질문'])

    if (orderRaw === null && !typeRaw && !question) return

    if (orderRaw === null) {
      errors.push({ row: rowNum, message: '순서가 비어 있어요' })
      return
    }
    const qtype = TYPE_FROM_KOR[typeRaw]
    if (!qtype) {
      errors.push({
        row: rowNum,
        message: `유형이 올바르지 않아요: "${typeRaw}" (별점/한 줄/장문/단일/다중)`,
      })
      return
    }
    if (!question) {
      errors.push({ row: rowNum, message: '질문이 비어 있어요' })
      return
    }

    const description = s(raw['설명']) || null
    const isRequired = parseRequired(raw['필수'])
    const choicesRaw = s(raw['선택지'])
    let choices: string[] | null = null
    if (qtype === 'single_choice' || qtype === 'multi_choice') {
      if (!choicesRaw) {
        errors.push({
          row: rowNum,
          message: '객관식은 선택지가 필요해요 (쉼표로 구분, 최소 2개)',
        })
        return
      }
      const parsed = choicesRaw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      if (parsed.length < 2) {
        errors.push({ row: rowNum, message: '선택지는 최소 2개 필요해요' })
        return
      }
      choices = parsed
    }

    rows.push({
      order_num: orderRaw,
      question_type: qtype,
      question,
      description,
      is_required: isRequired,
      choices,
      is_active: true,
    })
  })

  return { rows, errors }
}

export function downloadSurveyQuestionTemplate(filename: string): void {
  const data: (string | number)[][] = [
    HEADERS.slice() as unknown as string[],
    [1, '별점', '오늘 행사에 얼마나 만족하셨어요?', '1점=불만족 / 5점=대만족', 'Y', ''],
    [2, 'single_choice', '가장 좋았던 점은?', '', 'N', '미션 풀이,팀 활동,분위기,기타'],
    [3, 'multi_choice', '다시 참가하고 싶은 이유는? (여러 개)', '', 'N', '재미있어서,친구와 함께,상품,새로운 경험'],
    [4, '한 줄', '한 줄로 표현한다면?', '', 'N', ''],
    [5, '장문', '운영진에게 하고 싶은 말', '자유롭게 적어주세요', 'N', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 40 },
    { wch: 28 },
    { wch: 6 },
    { wch: 36 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '설문 질문')
  XLSX.writeFile(wb, filename)
}

export function exportSurveyQuestionsToExcel(
  questions: SurveyQuestion[],
  filename: string,
): void {
  const data: (string | number)[][] = [HEADERS.slice() as unknown as string[]]
  for (const q of questions) {
    data.push([
      q.order_num,
      TYPE_TO_KOR[q.question_type],
      q.question,
      q.description ?? '',
      q.is_required ? 'Y' : 'N',
      (q.choices ?? []).join(','),
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 40 },
    { wch: 28 },
    { wch: 6 },
    { wch: 36 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '설문 질문')
  XLSX.writeFile(wb, filename)
}

interface TeamLite {
  id: string
  team_name: string
}

function formatAnswerCell(
  q: SurveyQuestion,
  r: SurveyResponse | undefined,
): string {
  if (!r) return ''
  switch (q.question_type) {
    case 'rating':
      return r.answer_number !== null ? String(r.answer_number) : ''
    case 'short_text':
    case 'long_text':
      return r.answer_text ?? ''
    case 'single_choice':
      return r.answer_choices?.[0] ?? r.answer_text ?? ''
    case 'multi_choice':
      return (r.answer_choices ?? []).join(', ')
  }
}

export function exportSurveyResponsesToExcel(
  questions: SurveyQuestion[],
  responses: SurveyResponse[],
  teams: TeamLite[],
  filename: string,
): void {
  const teamById = new Map(teams.map((t) => [t.id, t.team_name]))
  const sortedQ = [...questions].sort((a, b) => a.order_num - b.order_num)

  // 시트1: 응답 요약 (질문별 통계)
  const summary: (string | number)[][] = [
    ['순서', '유형', '질문', '응답 수', '요약'],
  ]
  for (const q of sortedQ) {
    const rs = responses.filter((r) => r.question_id === q.id)
    let summaryStr = ''
    if (q.question_type === 'rating') {
      const nums = rs
        .map((r) => r.answer_number)
        .filter((x): x is number => x !== null)
      if (nums.length > 0) {
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length
        summaryStr = `평균 ${avg.toFixed(2)} (1~5)`
      }
    } else if (q.question_type === 'single_choice' || q.question_type === 'multi_choice') {
      const counts = new Map<string, number>()
      for (const r of rs) {
        for (const c of r.answer_choices ?? []) {
          counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      }
      summaryStr = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c}(${n})`)
        .join(', ')
    } else {
      summaryStr = `텍스트 응답 ${rs.length}건`
    }
    summary.push([
      q.order_num,
      TYPE_TO_KOR[q.question_type],
      q.question,
      rs.length,
      summaryStr,
    ])
  }
  const ws1 = XLSX.utils.aoa_to_sheet(summary)
  ws1['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 40 }, { wch: 8 }, { wch: 60 }]

  // 시트2: 개별 응답 (응답자별 한 행, 컬럼에 각 질문)
  type RowKey = string // `${team_id}__${respondent_name||''}`
  const grouped = new Map<RowKey, SurveyResponse[]>()
  for (const r of responses) {
    const key = `${r.team_id}__${r.respondent_name ?? ''}`
    const arr = grouped.get(key) ?? []
    arr.push(r)
    grouped.set(key, arr)
  }
  const detailHeaders: string[] = ['팀 이름', '응답자']
  for (const q of sortedQ) {
    detailHeaders.push(`Q${q.order_num}. ${q.question}`)
  }
  const detail: (string | number)[][] = [detailHeaders]
  for (const [, rs] of grouped) {
    const first = rs[0]
    const row: (string | number)[] = [
      teamById.get(first.team_id) ?? '(알 수 없음)',
      first.respondent_name ?? '',
    ]
    for (const q of sortedQ) {
      const r = rs.find((x) => x.question_id === q.id)
      row.push(formatAnswerCell(q, r))
    }
    detail.push(row)
  }
  const ws2 = XLSX.utils.aoa_to_sheet(detail)
  ws2['!cols'] = detailHeaders.map((_, i) => ({
    wch: i === 0 ? 16 : i === 1 ? 12 : 28,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '응답 요약')
  XLSX.utils.book_append_sheet(wb, ws2, '개별 응답')
  XLSX.writeFile(wb, filename)
}
