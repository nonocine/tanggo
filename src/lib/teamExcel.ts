import * as XLSX from 'xlsx'

export interface TeamRow {
  id: string
  team_name: string
  start_order: number | null
  member_count: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface MemberRow {
  id: string
  team_id: string
  name: string
  created_at: string
}

export function teamStatusLabel(t: Pick<TeamRow, 'started_at' | 'finished_at'>): string {
  if (t.finished_at) return '완료'
  if (t.started_at) return '진행 중'
  return '시작 전'
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function exportTeamsToExcel(
  teams: TeamRow[],
  membersByTeam: Map<string, MemberRow[]>,
  filename: string,
): void {
  const sheet1: (string | number)[][] = [
    ['출발순서', '팀 이름', '팀원 수', '상태', '등록 시각'],
  ]
  for (const t of teams) {
    sheet1.push([
      t.start_order ?? '',
      t.team_name,
      t.member_count ?? 0,
      teamStatusLabel(t),
      formatDateTime(t.created_at),
    ])
  }

  const sheet2: (string | number)[][] = [['팀 이름', '순번', '팀원 이름']]
  for (const t of teams) {
    const members = membersByTeam.get(t.id) ?? []
    if (members.length === 0) {
      sheet2.push([t.team_name, '', ''])
      continue
    }
    members.forEach((m, idx) => {
      sheet2.push([t.team_name, idx + 1, m.name])
    })
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1)
  ws1['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 22 }]
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2)
  ws2['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '팀 목록')
  XLSX.utils.book_append_sheet(wb, ws2, '팀원 명단')
  XLSX.writeFile(wb, filename)
}
