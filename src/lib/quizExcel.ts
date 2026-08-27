import * as XLSX from 'xlsx'
import type { MissionSubtype, Quiz, QuizInput, QuizType } from './quizTypes'

const HEADERS = [
  '번호',
  '유형',
  '세부',
  '문제',
  '위치힌트',
  '보기1',
  '보기2',
  '보기3',
  '보기4',
  '정답',
  '정답변형',
  '힌트',
] as const

const TYPE_FROM_KOR: Record<string, QuizType> = {
  주관식: 'text',
  객관식: 'choice',
  현장미션: 'mission',
  '현장 미션': 'mission',
  text: 'text',
  choice: 'choice',
  mission: 'mission',
}

const TYPE_TO_KOR: Record<QuizType, string> = {
  text: '주관식',
  choice: '객관식',
  mission: '현장 미션',
}

const SUBTYPE_FROM_KOR: Record<string, MissionSubtype> = {
  영상: 'video',
  사진: 'photo',
  인증: 'verify',
  '영상 업로드': 'video',
  '사진 업로드': 'photo',
  '직접 인증': 'verify',
  '사진+이름': 'photo_with_text',
  '사진 + 이름': 'photo_with_text',
  video: 'video',
  photo: 'photo',
  verify: 'verify',
  photo_with_text: 'photo_with_text',
}

const SUBTYPE_TO_KOR: Record<MissionSubtype, string> = {
  video: '영상',
  photo: '사진',
  verify: '인증',
  photo_with_text: '사진+이름',
}

interface ParseResult {
  rows: QuizInput[]
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

export async function parseQuizExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { rows: [], errors: [{ row: 0, message: '시트가 비어 있어요' }] }

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const rows: QuizInput[] = []
  const errors: { row: number; message: string }[] = []

  json.forEach((raw, i) => {
    const rowNum = i + 2 // header row = 1
    const orderNumRaw = n(raw['번호'])
    const typeRaw = s(raw['유형'])
    const subtypeRaw = s(raw['세부'])
    const question = s(raw['문제'])

    if (orderNumRaw === null && !typeRaw && !question) return // skip blank rows

    if (orderNumRaw === null) {
      errors.push({ row: rowNum, message: '번호가 비어 있어요' })
      return
    }
    const type = TYPE_FROM_KOR[typeRaw]
    if (!type) {
      errors.push({ row: rowNum, message: `유형이 올바르지 않아요: "${typeRaw}"` })
      return
    }
    if (!question) {
      errors.push({ row: rowNum, message: '문제가 비어 있어요' })
      return
    }

    let mission_subtype: MissionSubtype | null = null
    if (type === 'mission') {
      if (!subtypeRaw) {
        errors.push({
          row: rowNum,
          message: '현장 미션은 "세부"가 필요해요 (영상/사진/인증)',
        })
        return
      }
      const st = SUBTYPE_FROM_KOR[subtypeRaw]
      if (!st) {
        errors.push({
          row: rowNum,
          message: `세부가 올바르지 않아요: "${subtypeRaw}" (영상/사진/인증)`,
        })
        return
      }
      mission_subtype = st
    }

    const locationHint = s(raw['위치힌트']) || null
    const hint = s(raw['힌트']) || null
    const answerRaw = s(raw['정답'])
    const variantsRaw = s(raw['정답변형'])

    let choices: string[] | null = null
    let answer: string | null = null
    let answer_variants: string[] | null = null

    if (type === 'choice') {
      const c = [
        s(raw['보기1']),
        s(raw['보기2']),
        s(raw['보기3']),
        s(raw['보기4']),
      ]
      if (c.some((x) => !x)) {
        errors.push({ row: rowNum, message: '객관식은 보기 4개가 모두 필요해요' })
        return
      }
      if (!answerRaw) {
        errors.push({ row: rowNum, message: '객관식은 정답(1~4)이 필요해요' })
        return
      }
      const ansNum = Number(answerRaw)
      if (!Number.isInteger(ansNum) || ansNum < 1 || ansNum > 4) {
        errors.push({ row: rowNum, message: `정답은 1~4 사이여야 해요: "${answerRaw}"` })
        return
      }
      choices = c
      answer = String(ansNum)
    } else if (type === 'text') {
      if (!answerRaw) {
        errors.push({ row: rowNum, message: '주관식은 정답이 필요해요' })
        return
      }
      answer = answerRaw
      if (variantsRaw) {
        answer_variants = variantsRaw
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      }
    }

    rows.push({
      order_num: orderNumRaw,
      type,
      mission_subtype,
      question,
      location_hint: locationHint,
      choices,
      answer,
      answer_variants,
      hint,
      is_active: true,
    })
  })

  return { rows, errors }
}

export function exportQuizzesToExcel(quizzes: Quiz[], filename: string): void {
  const data: (string | number)[][] = [HEADERS.slice() as unknown as string[]]
  for (const q of quizzes) {
    data.push([
      q.order_num,
      TYPE_TO_KOR[q.type],
      q.mission_subtype ? SUBTYPE_TO_KOR[q.mission_subtype] : '',
      q.question,
      q.location_hint ?? '',
      q.choices?.[0] ?? '',
      q.choices?.[1] ?? '',
      q.choices?.[2] ?? '',
      q.choices?.[3] ?? '',
      q.answer ?? '',
      (q.answer_variants ?? []).join(','),
      q.hint ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 8 },
    { wch: 40 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 24 },
    { wch: 30 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '미션 목록')
  XLSX.writeFile(wb, filename)
}

export function downloadQuizTemplate(filename: string): void {
  const data: (string | number)[][] = [
    HEADERS.slice() as unknown as string[],
    [
      1,
      '주관식',
      '',
      '학교 정문 입구 동상 이름은?',
      '1F 정문 앞',
      '',
      '',
      '',
      '',
      '하마',
      '하마,HAMA',
      '큰 동물이에요',
    ],
    [
      2,
      '객관식',
      '',
      '교무실은 몇 층에 있나요?',
      '안내판 참고',
      '1층',
      '2층',
      '3층',
      '4층',
      2,
      '',
      '직원실 옆이에요',
    ],
    [
      3,
      '현장 미션',
      '인증',
      '도서관 사서 선생님과 하이파이브!',
      '3F 도서관',
      '',
      '',
      '',
      '',
      '',
      '',
      '운영자가 확인해줘요',
    ],
    [
      4,
      '현장 미션',
      '영상',
      '단체로 K-POP 30초 챌린지 영상 찍기',
      '강당',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      5,
      '현장 미션',
      '사진',
      '교장 선생님과 단체 셀카',
      '교장실 앞',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 8 },
    { wch: 40 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 24 },
    { wch: 30 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '미션 양식')
  XLSX.writeFile(wb, filename)
}

export function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
