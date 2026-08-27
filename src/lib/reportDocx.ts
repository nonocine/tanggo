import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeightRule,
  BorderStyle,
} from 'docx'
import { SEASON_CONFIG } from '../config/seasonConfig'
import { APP_CONFIG } from '../config/appConfig'
import {
  type ReportData,
  formatElapsed,
} from './reportData'
import { SURVEY_TYPE_LABEL } from './surveyTypes'
import type { NarrativeReport } from './reportNarrative'

const FONT = '맑은 고딕'
const ORANGE = 'F26B3A'
const CREAM_LIGHT = 'FFF6E5'
const HEADER_BG = 'F4C430'
const TEXT_DARK = '2B2B2B'

type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

function p(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: Align } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 22, // half-points (22 = 11pt)
        color: opts.color ?? TEXT_DARK,
        font: FONT,
      }),
    ],
  })
}

function h(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel], color = TEXT_DARK): Paragraph {
  return new Paragraph({
    heading: level,
    children: [
      new TextRun({
        text,
        bold: true,
        size: level === HeadingLevel.HEADING_1 ? 36 : 28,
        color,
        font: FONT,
      }),
    ],
  })
}

function cell(text: string, opts: { bold?: boolean; bg?: string; color?: string; align?: Align; size?: number } = {}): TableCell {
  return new TableCell({
    shading: opts.bg
      ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.bg }
      : undefined,
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            size: opts.size ?? 20,
            color: opts.color ?? TEXT_DARK,
            font: FONT,
          }),
        ],
      }),
    ],
  })
}

const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: 'D6D6D6',
}

function table(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: THIN_BORDER,
      bottom: THIN_BORDER,
      left: THIN_BORDER,
      right: THIN_BORDER,
      insideHorizontal: THIN_BORDER,
      insideVertical: THIN_BORDER,
    },
    rows,
  })
}

function row(cells: TableCell[], header = false): TableRow {
  return new TableRow({
    height: { value: 360, rule: HeightRule.ATLEAST },
    tableHeader: header,
    children: cells,
  })
}

function spacer(half = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '', font: FONT, size: half ? 12 : 22 })],
  })
}

function narrativeParagraphs(text: string): Paragraph[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const lines = trimmed.split(/\n+/).filter((s) => s.trim())
  return lines.map((line) =>
    new Paragraph({
      spacing: { line: 360 },
      children: [
        new TextRun({
          text: line.trim(),
          size: 22,
          color: TEXT_DARK,
          font: FONT,
        }),
      ],
    }),
  )
}

function pageBreak(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '', break: 1 })],
    pageBreakBefore: true,
  })
}

function todayKor(d = new Date()): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function buildCoverSection(data: ReportData): Paragraph[] {
  const today = todayKor(data.fetchedAt)
  return [
    spacer(),
    spacer(),
    spacer(),
    p(SEASON_CONFIG.eventDate, { bold: true, size: 28, align: AlignmentType.CENTER, color: ORANGE.toLowerCase() }),
    spacer(),
    p(SEASON_CONFIG.seasonNameFormal, { bold: true, size: 48, align: AlignmentType.CENTER }),
    spacer(),
    p('실내 오리엔티어링 행사', { bold: true, size: 30, align: AlignmentType.CENTER }),
    p('결과 보고서', { bold: true, size: 30, align: AlignmentType.CENTER }),
    spacer(),
    spacer(),
    spacer(),
    p(APP_CONFIG.appOrganizer, { bold: true, size: 26, align: AlignmentType.CENTER }),
    spacer(),
    p(`작성일: ${today}`, { size: 22, align: AlignmentType.CENTER, color: '666666' }),
  ]
}

function buildOverviewSection(
  data: ReportData,
  narrative: string,
): (Paragraph | Table)[] {
  return [
    h('1. 행사 개요', HeadingLevel.HEADING_1, ORANGE.toLowerCase()),
    spacer(true),
    table([
      row([
        cell('행사명', { bold: true, bg: CREAM_LIGHT }),
        cell(SEASON_CONFIG.seasonNameFormal),
      ]),
      row([
        cell('컨셉', { bold: true, bg: CREAM_LIGHT }),
        cell(SEASON_CONFIG.seasonDescription),
      ]),
      row([
        cell('일시', { bold: true, bg: CREAM_LIGHT }),
        cell(SEASON_CONFIG.eventDate),
      ]),
      row([
        cell('주최', { bold: true, bg: CREAM_LIGHT }),
        cell(APP_CONFIG.appOrganizer),
      ]),
      row([
        cell('운영 시스템', { bold: true, bg: CREAM_LIGHT }),
        cell(`${APP_CONFIG.appName} v${APP_CONFIG.version}`),
      ]),
      row([
        cell('보고서 생성', { bold: true, bg: CREAM_LIGHT }),
        cell(todayKor(data.fetchedAt)),
      ]),
    ]),
    spacer(true),
    ...narrativeParagraphs(narrative),
  ]
}

function buildParticipationSection(
  data: ReportData,
  narrative: string,
): (Paragraph | Table)[] {
  const b = data.basic
  return [
    h('2. 참여 현황', HeadingLevel.HEADING_1, ORANGE.toLowerCase()),
    spacer(true),
    table([
      row(
        [
          cell('항목', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
          cell('수치', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        ],
        true,
      ),
      row([cell('등록 팀'), cell(`${b.totalTeams}팀`, { align: AlignmentType.CENTER })]),
      row([cell('시작 팀'), cell(`${b.startedTeams}팀`, { align: AlignmentType.CENTER })]),
      row([cell('완료 팀'), cell(`${b.finishedTeams}팀`, { align: AlignmentType.CENTER })]),
      row([cell('참여 청소년'), cell(`${b.totalMembers}명`, { align: AlignmentType.CENTER })]),
      row([cell('등록 미션 (활성)'), cell(`${b.activeQuizCount}개`, { align: AlignmentType.CENTER })]),
      row([cell('목표 달성률 (완료/등록)'), cell(`${b.goalRatePct}%`, { align: AlignmentType.CENTER, bold: true, color: ORANGE.toLowerCase() })]),
      row([cell('평균 정답 미션'), cell(`${b.avgCorrect}개 (${b.avgCorrectPct}%)`, { align: AlignmentType.CENTER })]),
      row([cell('평균 소요 시간 (완료팀)'), cell(formatElapsed(b.avgElapsedSec), { align: AlignmentType.CENTER })]),
    ]),
    spacer(true),
    ...narrativeParagraphs(narrative),
  ]
}

function buildMissionSection(
  data: ReportData,
  narrative: string,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  out.push(h('3. 미션 분석', HeadingLevel.HEADING_1, ORANGE.toLowerCase()))
  out.push(spacer(true))

  if (data.missionStats.length === 0) {
    out.push(p('등록된 활성 미션이 없습니다.', { color: '666666' }))
    if (narrative.trim()) {
      out.push(spacer(true))
      out.push(...narrativeParagraphs(narrative))
    }
    return out
  }

  // 전체 미션 정답률 표
  out.push(p('▷ 전체 미션별 정답률', { bold: true }))
  out.push(spacer(true))
  const headerRow = row(
    [
      cell('#', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('유형', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('미션', { bold: true, bg: HEADER_BG }),
      cell('정답팀', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('정답률', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
    ],
    true,
  )
  const bodyRows = data.missionStats.map((m) =>
    row([
      cell(String(m.quiz.order_num), { align: AlignmentType.CENTER }),
      cell(typeLabel(m.quiz.type, m.quiz.mission_subtype), {
        align: AlignmentType.CENTER,
      }),
      cell(m.quiz.question),
      cell(`${m.correctCount} / ${data.basic.totalTeams}`, {
        align: AlignmentType.CENTER,
      }),
      cell(`${Math.round(m.correctRate * 100)}%`, {
        align: AlignmentType.CENTER,
        bold: true,
      }),
    ]),
  )
  out.push(table([headerRow, ...bodyRows]))

  // TOP3
  out.push(spacer())
  out.push(p('▷ 가장 어려운 미션 TOP 3', { bold: true }))
  out.push(spacer(true))
  out.push(buildTop3Table(data.hardestTop3))
  out.push(spacer())
  out.push(p('▷ 가장 쉬운 미션 TOP 3', { bold: true }))
  out.push(spacer(true))
  out.push(buildTop3Table(data.easiestTop3))
  if (narrative.trim()) {
    out.push(spacer())
    out.push(...narrativeParagraphs(narrative))
  }
  return out
}

function buildTop3Table(
  list: ReportData['missionStats'],
): Table {
  if (list.length === 0) {
    return table([row([cell('데이터 없음', { align: AlignmentType.CENTER })])])
  }
  return table([
    row(
      [
        cell('순위', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('#', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('미션', { bold: true, bg: HEADER_BG }),
        cell('정답률', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      ],
      true,
    ),
    ...list.map((m, i) =>
      row([
        cell(`${i + 1}위`, { align: AlignmentType.CENTER, bold: true }),
        cell(String(m.quiz.order_num), { align: AlignmentType.CENTER }),
        cell(m.quiz.question),
        cell(`${Math.round(m.correctRate * 100)}%`, {
          align: AlignmentType.CENTER,
          bold: true,
        }),
      ]),
    ),
  ])
}

function typeLabel(
  t: string,
  sub: string | null | undefined,
): string {
  if (t === 'text') return '주관식'
  if (t === 'choice') return '객관식'
  if (t === 'mission') {
    if (sub === 'video') return '현장(영상)'
    if (sub === 'photo') return '현장(사진)'
    if (sub === 'verify') return '현장(인증)'
    if (sub === 'photo_with_text') return '현장(사진+이름)'
    return '현장'
  }
  return t
}

function buildRankingSection(
  data: ReportData,
  narrative: string,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  out.push(h('4. 팀별 성과', HeadingLevel.HEADING_1, ORANGE.toLowerCase()))
  out.push(spacer(true))
  if (data.rankings.length === 0) {
    out.push(p('등록된 팀이 없습니다.', { color: '666666' }))
    if (narrative.trim()) {
      out.push(spacer(true))
      out.push(...narrativeParagraphs(narrative))
    }
    return out
  }
  const headerRow = row(
    [
      cell('순위', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('팀 이름', { bold: true, bg: HEADER_BG }),
      cell('정답', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('진행률', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('소요 시간', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      cell('상태', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
    ],
    true,
  )
  const bodyRows = data.rankings.map((r) => {
    const rankStr =
      r.rank === 1 ? '🥇 1위' : r.rank === 2 ? '🥈 2위' : r.rank === 3 ? '🥉 3위' : `${r.rank}위`
    const bg = r.rank <= 3 ? CREAM_LIGHT : undefined
    const status = r.team.finished_at
      ? '완료'
      : r.team.started_at
        ? '진행 중'
        : '시작 전'
    return row([
      cell(rankStr, { align: AlignmentType.CENTER, bold: r.rank <= 3, bg }),
      cell(r.team.team_name, { bold: r.rank <= 3, bg }),
      cell(`${r.correctCount} / ${r.totalQuizzes}`, { align: AlignmentType.CENTER, bg }),
      cell(`${r.pct}%`, { align: AlignmentType.CENTER, bg }),
      cell(formatElapsed(r.elapsedSec), { align: AlignmentType.CENTER, bg }),
      cell(status, { align: AlignmentType.CENTER, bg }),
    ])
  })
  out.push(table([headerRow, ...bodyRows]))
  if (narrative.trim()) {
    out.push(spacer())
    out.push(...narrativeParagraphs(narrative))
  }
  return out
}

function buildSurveySection(
  data: ReportData,
  narrative: string | null,
): (Paragraph | Table)[] {
  const s = data.surveyStats
  const out: (Paragraph | Table)[] = []
  out.push(h('5. 만족도 조사 결과', HeadingLevel.HEADING_1, ORANGE.toLowerCase()))
  out.push(spacer(true))

  if (s.questionCount === 0) {
    out.push(p('등록된 설문 질문이 없습니다.', { color: '666666' }))
    if (narrative && narrative.trim()) {
      out.push(spacer(true))
      out.push(...narrativeParagraphs(narrative))
    }
    return out
  }

  out.push(
    table([
      row([
        cell('설문 질문', { bold: true, bg: CREAM_LIGHT }),
        cell(`${s.questionCount}개`, { align: AlignmentType.CENTER }),
      ]),
      row([
        cell('응답자', { bold: true, bg: CREAM_LIGHT }),
        cell(`${s.respondentCount}명`, { align: AlignmentType.CENTER }),
      ]),
      row([
        cell('총 응답', { bold: true, bg: CREAM_LIGHT }),
        cell(`${s.responseCount}건`, { align: AlignmentType.CENTER }),
      ]),
      row([
        cell('응답률 (응답자/청소년)', { bold: true, bg: CREAM_LIGHT }),
        cell(`${Math.round(s.responseRate * 100)}%`, {
          align: AlignmentType.CENTER,
          bold: true,
          color: ORANGE.toLowerCase(),
        }),
      ]),
    ]),
  )

  if (s.ratings.length > 0) {
    out.push(spacer())
    out.push(p('▷ 별점 질문 평균 및 분포', { bold: true }))
    out.push(spacer(true))
    const header = row(
      [
        cell('#', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('질문', { bold: true, bg: HEADER_BG }),
        cell('응답', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('평균', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('1점', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('2점', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('3점', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('4점', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
        cell('5점', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
      ],
      true,
    )
    const rows = s.ratings.map((r) =>
      row([
        cell(String(r.question.order_num), { align: AlignmentType.CENTER }),
        cell(r.question.question),
        cell(String(r.count), { align: AlignmentType.CENTER }),
        cell(r.avg !== null ? r.avg.toFixed(2) : '—', {
          align: AlignmentType.CENTER,
          bold: true,
        }),
        ...r.distribution.map((n) => cell(String(n), { align: AlignmentType.CENTER })),
      ]),
    )
    out.push(table([header, ...rows]))
  }

  if (s.choices.length > 0) {
    out.push(spacer())
    out.push(p('▷ 객관식 응답 분포', { bold: true }))
    for (const c of s.choices) {
      out.push(spacer(true))
      out.push(
        p(`Q${c.question.order_num}. ${c.question.question}  (응답 ${c.count}건)`, {
          bold: true,
        }),
      )
      out.push(
        table([
          row(
            [
              cell('선택지', { bold: true, bg: HEADER_BG }),
              cell('응답 수', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
              cell('비율', { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
            ],
            true,
          ),
          ...c.buckets.map((b) =>
            row([
              cell(b.choice),
              cell(String(b.count), { align: AlignmentType.CENTER }),
              cell(`${b.pct}%`, { align: AlignmentType.CENTER, bold: true }),
            ]),
          ),
        ]),
      )
    }
  }

  if (s.texts.length > 0) {
    out.push(spacer())
    out.push(p('▷ 주관식 / 장문 응답', { bold: true }))
    for (const t of s.texts) {
      out.push(spacer(true))
      out.push(
        p(
          `Q${t.question.order_num}. ${t.question.question}  (${SURVEY_TYPE_LABEL[t.question.question_type]}, ${t.texts.length}건)`,
          { bold: true },
        ),
      )
      if (t.texts.length === 0) {
        out.push(p('  (응답 없음)', { color: '999999' }))
      } else {
        for (const v of t.texts) {
          out.push(
            p(`  · ${v}`, { size: 20 }),
          )
        }
      }
    }
  }

  if (narrative && narrative.trim()) {
    out.push(spacer())
    out.push(...narrativeParagraphs(narrative))
  }

  return out
}

function buildConclusionSection(narrative: string): (Paragraph | Table)[] {
  return [
    h('6. 결론 및 시사점', HeadingLevel.HEADING_1, ORANGE.toLowerCase()),
    spacer(true),
    ...narrativeParagraphs(narrative),
  ]
}

export async function generateReportDocx(
  data: ReportData,
  narrative: NarrativeReport,
): Promise<Blob> {
  const cover = buildCoverSection(data)
  const overview = buildOverviewSection(data, narrative.overview)
  const participation = buildParticipationSection(data, narrative.participation)
  const mission = buildMissionSection(data, narrative.missions)
  const ranking = buildRankingSection(data, narrative.teams)
  const survey = buildSurveySection(data, narrative.survey)
  const conclusion = buildConclusionSection(narrative.conclusion)

  const doc = new Document({
    creator: APP_CONFIG.appOrganizer,
    title: `${SEASON_CONFIG.seasonName} 결과 보고서`,
    description: '실내 오리엔티어링 행사 결과 보고서',
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // 20mm (1mm = 56.7 twips)
              right: 1134,
              bottom: 1134,
              left: 1134,
            },
            size: {
              orientation: PageOrientation.PORTRAIT,
            },
          },
        },
        children: [
          ...cover,
          pageBreak(),
          ...overview,
          spacer(),
          ...participation,
          spacer(),
          ...mission,
          spacer(),
          ...ranking,
          spacer(),
          ...survey,
          spacer(),
          ...conclusion,
        ],
      },
    ],
  })

  return await Packer.toBlob(doc)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

