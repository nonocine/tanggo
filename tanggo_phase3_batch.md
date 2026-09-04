# 탐GO — Phase 3 배치 명령 (전원 동의 제출 + 방장 자동 설정 + 앱 재진입 DaySelect)
> Claude Code 터미널에서 실행. 경로: `C:\Users\user\Desktop\Projects\tanggo`
> DB 마이그레이션은 이미 완료됨:
> - `tanggo_member_votes` 테이블 신규 생성 (team_id, quiz_id, member_name, selected_answer, Realtime 등록)
> - `tanggo_teams.leader_name` 컬럼 추가

---

아래 내용을 Claude Code에 그대로 붙여넣어 실행해줘.

```
tanggo 프로젝트에 아래 3가지 기능을 순서대로 구현해줘.
기존 코드 스타일(Tailwind, 한국어 UI, bg-cream, border-orange-main 등) 그대로 유지.
DB에는 이미 tanggo_member_votes 테이블과 tanggo_teams.leader_name 컬럼이 추가되어 있어.

---

### STEP 1: 방장 자동 설정 — src/pages/TeamCreate.tsx 수정

TeamCreate의 handleSubmit 함수에서 팀 INSERT 직후:
tanggo_teams의 leader_name 컬럼에 members[0].name.trim() (첫 번째 팀원 이름)을 저장.

```typescript
// 팀 INSERT 시 leader_name 포함
const { data: team, error: teamError } = await supabase
  .from('tanggo_teams')
  .insert({ 
    team_name: trimmedName, 
    member_count: members.length,
    leader_name: members[0].name.trim()  // 첫 번째 팀원 = 방장
  })
  .select('id, team_name, leader_name')
  .single()
```

setTeam 호출 시 memberName을 members[0].name.trim()으로 설정:
```typescript
setTeam(team.id, team.team_name, members[0].name.trim())
```

팀원 입력 UI에서 첫 번째 팀원 입력란 옆에 👑 방장 뱃지 표시:
- placeholder를 "방장 이름 (본인)" 으로 변경
- 번호 뱃지 옆에 작은 👑 표시 (idx === 0일 때만)

---

### STEP 2: 앱 재진입 시 DaySelect — src/pages/TeamJoin.tsx 수정

handleMemberConfirmed 함수 수정:
현재는 started_at 있으면 → /mission 이동.
이걸 아래로 교체:

```typescript
// event_mode도 함께 조회
const { data: config } = await supabase
  .from('tanggo_event_config')
  .select('service_ended, event_mode')
  .eq('id', 1)
  .maybeSingle()

setTeam(selected.id, selected.team_name, memberName)

if (finishedAt) {
  navigate('/result', { replace: true })
} else if (startedAt) {
  // multi_day면 DaySelect, single이면 기존 /mission
  if (config?.event_mode === 'multi_day') {
    navigate('/day-select', { replace: true })
  } else {
    navigate('/mission', { replace: true })
  }
} else {
  navigate('/lobby', { replace: true })
}
```

---

### STEP 3: 전원 동의 제출 시스템 구현

#### 3-A: src/lib/memberVotes.ts 신규 생성

```typescript
import { supabase } from './supabase'

export interface MemberVoteRow {
  id: string
  team_id: string
  quiz_id: string
  member_name: string
  selected_answer: string
  voted_at: string
}

// 내 답 선택/변경 (upsert)
export async function upsertMyVote(
  teamId: string,
  quizId: string,
  memberName: string,
  selectedAnswer: string,
): Promise<void> {
  await supabase
    .from('tanggo_member_votes')
    .upsert(
      { team_id: teamId, quiz_id: quizId, member_name: memberName, selected_answer: selectedAnswer },
      { onConflict: 'team_id,quiz_id,member_name' },
    )
}

// 특정 문제의 팀 전체 투표 현황 조회
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

// 전원 동의 여부 확인: 모든 팀원이 같은 답을 선택했는지
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
```

#### 3-B: 미션 카드 컴포넌트 내 투표 UI 구현

Mission.tsx의 퀴즈 카드 상세 모달(openQuiz 상태로 열리는 부분)에서
type='choice' 또는 type='text' 문제일 때 아래 로직을 추가:

**투표 상태 관리 (Mission 컴포넌트 상단에 추가):**
```typescript
const memberName = useTeamStore((s) => s.memberName)
const [votesMap, setVotesMap] = useState<Map<string, MemberVoteRow[]>>(new Map())

// openQuiz 변경 시 해당 문제 투표 현황 실시간 구독
useEffect(() => {
  if (!openQuiz || !teamId) return
  if (openQuiz.type === 'mission') return // 현장미션은 투표 불필요

  // 초기 로드
  fetchVotesForQuiz(teamId, openQuiz.id).then((votes) => {
    setVotesMap((prev) => new Map(prev).set(openQuiz.id, votes))
  })

  // Realtime 구독
  const channel = supabase
    .channel(`votes-${teamId}-${openQuiz.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'tanggo',
        table: 'tanggo_member_votes',
        filter: `team_id=eq.${teamId}`,
      },
      () => {
        fetchVotesForQuiz(teamId, openQuiz.id).then((votes) => {
          setVotesMap((prev) => new Map(prev).set(openQuiz.id, votes))
        })
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [openQuiz, teamId])
```

**방장 여부 판단:**
```typescript
// team 객체에서 leader_name 읽기 (TeamRow 타입에 leader_name: string | null 추가)
const isLeader = !!memberName && memberName === team?.leader_name
```

**퀴즈 카드 모달 안 투표 UI (type='choice' 기준, type='text'도 유사하게):**

선택지 버튼을 누르면:
1. upsertMyVote() 호출 → DB 저장
2. 내 선택 로컬 상태 업데이트

선택 후 아래 현황 패널 표시:
```
👥 팀원 투표 현황 (X / N명 완료)

● 홍길동  ✅ A번 선택
● 김철수  ✅ A번 선택  
● 이영희  ⏳ 아직 선택 중...
● 박민준  ✅ B번 선택  ← 다른 답
```
- 투표 완료: 이름 + 선택한 답 표시
- 미투표: 이름 + "⏳ 아직 선택 중..." 회색
- 다른 답 선택: 빨간색으로 표시 (불일치 명시)

**제출 버튼 조건:**
- isLeader === true 일 때만 제출 버튼 표시
- 비방장: "방장이 제출할 때까지 기다려주세요 👑" 안내 텍스트
- 방장이라도 전원 동일 답 선택 전: 버튼 비활성화 + "아직 X명이 선택 중이에요" 표시
- 전원 동일 답 선택 완료: 버튼 활성화 + "✅ 전원 동의! 제출하기" 초록색 버튼

**기존 handleAnswer 함수 수정:**
방장이 제출 버튼을 누를 때만 tanggo_answers에 INSERT.
(기존처럼 즉시 제출하지 않고, 전원 동의 확인 후 방장만 제출)

type='text' 주관식의 경우:
- 각자 textarea에 입력 후 "내 답 저장" 버튼으로 upsertMyVote 호출
- 전원이 동일한 텍스트를 입력했을 때만 제출 활성화
- (텍스트는 완전 일치 대신 normalize() 후 비교)

#### 3-C: tanggo_teams SELECT에 leader_name 추가

Mission.tsx의 fetchData에서 tanggo_teams SELECT 쿼리에 leader_name 추가:
```typescript
supabase
  .from('tanggo_teams')
  .select('id, team_name, started_at, finished_at, member_count, leader_name')
  .eq('id', teamId)
  .maybeSingle()
```

TeamRow 인터페이스에 `leader_name: string | null` 추가.

---

### STEP 4: LocationMission.tsx에도 동일한 투표 시스템 적용

MissionSlot.tsx의 type='choice', type='text' 슬롯에도
STEP 3과 동일한 투표 로직 적용.

MissionSlotProps에 추가:
```typescript
memberName: string | null
isLeader: boolean
teamMemberCount: number
```

LocationMission.tsx에서 MissionSlot 호출 시 위 props 전달.
(tanggo_teams에서 leader_name, member_count SELECT 필요)

---

### STEP 5: 빌드 확인 및 커밋

```bash
npm run build
git add -A
git commit -m "feat: 전원 동의 제출 시스템 + 방장 자동 설정 + 재진입 DaySelect (Phase 3)"
git push
```
```

---

## DB 완료 내용 (이미 적용됨)

| 작업 | 상태 |
|------|------|
| `tanggo_member_votes` 테이블 생성 | ✅ |
| RLS 정책 3개 (SELECT/INSERT/UPDATE) | ✅ |
| `(team_id, quiz_id, member_name)` UNIQUE 제약 | ✅ |
| Realtime publication 등록 | ✅ |
| `tanggo_teams.leader_name` 컬럼 추가 | ✅ |

---

## 핵심 UX 흐름 요약

```
[각 팀원 화면]           [방장 화면]
답 선택                  답 선택
  ↓ upsertMyVote           ↓ upsertMyVote
"방장이 제출할           투표 현황 실시간 표시
 때까지 대기 👑"          ↓ 전원 동일 답
                          ✅ 제출 버튼 활성화
                          ↓ 클릭
                          tanggo_answers INSERT
```
