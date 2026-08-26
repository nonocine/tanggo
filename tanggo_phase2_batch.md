# 탐GO (해결해On나) — Phase 2 배치 명령
> Claude Code 터미널에 이 파일 전체를 붙여넣어 실행하세요.
> 작업 디렉토리: `C:\Users\user\Desktop\Projects\tanggo`

---

## 작업 개요

DB는 이미 완료됨 (Supabase Phase 1 마이그레이션 적용 완료).  
이번 Phase 2는 **프론트엔드 신규 파일 생성 + 기존 파일 수정**이다.

### 신규 생성 파일
1. `src/lib/quizTypes.ts` — Quiz 타입에 새 필드 추가
2. `src/pages/DaySelect.tsx` — 1일차/2일차 선택 화면
3. `src/pages/LocationSelect.tsx` — 장소 선택 + 권한 체크
4. `src/pages/LocationMission.tsx` — 장소별 멀티슬롯 미션
5. `src/components/MissionSlot.tsx` — 슬롯 렌더러 (사진/영상/객관식/텍스트/이미지뷰어)
6. `src/pages/admin/tabs/LocationAssign.tsx` — 관리자 장소 배정 탭

### 수정 파일
7. `src/App.tsx` — 라우트 추가 (`/day-select`, `/location-select`, `/location-mission/:locationGroup`)
8. `src/pages/Lobby.tsx` — GO 후 분기 (single → /mission, multi_day → /day-select)
9. `src/pages/admin/AdminDashboard.tsx` — 장소배정 탭 추가
10. `src/components/MissionApprovalQueue.tsx` — 미승인 사유 입력 UI 추가

---

## 실행할 작업

아래 내용을 Claude Code 터미널에 그대로 붙여넣어 실행하라.

```
다음 작업을 순서대로 진행해줘. tanggo 프로젝트(React 19 + TypeScript + Vite + Supabase + Tailwind CSS 4)야.
Supabase DB에는 이미 아래 컬럼들이 추가되어 있어:
- tanggo_quizzes: day_number(int), location_group(text), location_group_order(int), slot_order(int), requires_approval_to_proceed(bool), reference_images(jsonb)
- tanggo_teams: assigned_locations(jsonb)  
- tanggo_event_config: event_mode(text: 'single'|'multi_day'), days(jsonb)
- tanggo_mission_requests: rejection_reason(text), slot_label(text)

기존 코드 스타일(Tailwind, 컬러 토큰 var(--color-orange-main) 등, 한국어 UI)을 철저히 따라줘.
기존 tanggo 디자인 컬러: 오렌지 #FF6B47(--color-orange-main), 민트 #4CAF7F, 노랑 #FFD93D, 크림 배경(bg-cream).

---

### STEP 1: src/lib/quizTypes.ts 수정
기존 Quiz 인터페이스에 아래 필드를 추가해줘:

```typescript
day_number: number | null
location_group: string | null
location_group_order: number | null
slot_order: number
requires_approval_to_proceed: boolean
reference_images: Array<{ label: string; url: string }> | null
```

QuizInput 인터페이스에도 동일하게 추가.

---

### STEP 2: src/pages/DaySelect.tsx 신규 생성

기능:
- Supabase에서 tanggo_event_config(id=1)의 days(jsonb) 필드를 읽어온다
- days 예시: [{"day":1,"label":"1일차","desc":"기관 라운딩 미션"},{"day":2,"label":"2일차","desc":"장소별 미션 수행"}]
- 카드 형태로 각 Day를 표시 (이모지: 1일차=📅, 2일차=🗺️)
- 1일차 클릭 → navigate('/mission') (기존 Mission 페이지, day_number=1 쿼리 파라미터)
- 2일차 클릭 → navigate('/location-select')
- ParticipantGate 안에서 사용됨 (teamId는 useTeamStore)
- AnnouncementBanner 상단 표시
- 기존 Lobby 디자인 톤 유지 (bg-cream, 카드에 border-4 border-orange-main, rounded-3xl)

---

### STEP 3: src/pages/LocationSelect.tsx 신규 생성

기능:
- Supabase tanggo_quizzes에서 day_number=2이고 slot_order=1인 row들을 location_group으로 그룹핑해 장소 목록을 가져온다
  (즉, 각 장소의 대표 슬롯(도착인증) 하나씩만 불러와 장소 목록 구성)
- Supabase tanggo_teams에서 현재 팀의 assigned_locations(jsonb 배열)를 가져온다
- 장소 카드 그리드(모바일 2열) 표시
- 카드 클릭 시: assigned_locations에 포함되면 navigate('/location-mission/' + encodeURIComponent(locationGroup))
- 카드 클릭 시: assigned_locations에 없으면 모달 팝업 "우리 조에 배정된 장소가 아닙니다. 배정된 장소를 선택해 주세요." (확인 버튼 닫기)
- assigned_locations가 null이면 전체 접근 허용 (개발/테스트용)
- 이미 모든 슬롯이 완료(승인)된 장소는 카드에 ✅ 뱃지 표시
- 미완료 장소는 🔒(비배정) 또는 📍(배정됨) 아이콘으로 구분
- 장소_group_order 기준 정렬
- AnnouncementBanner 상단 표시

---

### STEP 4: src/pages/LocationMission.tsx 신규 생성

기능:
- URL 파라미터: /location-mission/:locationGroup
- Supabase tanggo_quizzes에서 location_group = locationGroup이고 day_number=2인 row를 slot_order ASC로 가져온다
- slot_order 순서대로 슬롯을 렌더링 (MissionSlot 컴포넌트 사용)
- requires_approval_to_proceed=true인 슬롯이 아직 승인 안 됐으면, 그 이후 슬롯은 잠금 처리 (회색 카드 + "이전 미션 승인 후 진행 가능합니다" 안내)
- 전체 슬롯 완료(승인) 시 축하 모달 표시 → "장소 선택으로 돌아가기" 버튼 → navigate('/location-select')
- 5초 폴링으로 승인 상태 갱신
- AnnouncementBanner 상단 표시
- 상단에 장소명 표시, 뒤로가기 버튼(← 장소 선택) 제공

---

### STEP 5: src/components/MissionSlot.tsx 신규 생성

이 컴포넌트는 Quiz 하나를 받아 해당 슬롯 UI를 렌더링한다.

Props:
```typescript
interface MissionSlotProps {
  quiz: Quiz
  teamId: string
  existingRequest: MissionRequestRow | null  // 이미 제출된 요청
  existingAnswer: AnswerRow | null           // 이미 제출된 답변
  locked: boolean                            // requires_approval_to_proceed 게이트
  slotIndex: number                          // 표시용 번호
}
```

렌더링 케이스:
1. **locked=true**: 회색 카드, 자물쇠 아이콘, "이전 단계 승인 후 진행 가능" 메시지
2. **type='mission' & mission_subtype='photo'**: 
   - reference_images가 있으면 상단에 이미지 뷰어(썸네일 가로 스크롤, 탭하면 전체화면 모달)
   - 사진 업로드 버튼 (기존 missionMedia.ts의 uploadMissionMedia 활용)
   - 업로드 후 tanggo_mission_requests에 INSERT (status='pending', media_type='photo', slot_label=quiz.question 앞 20자)
   - 승인됨(approved): 초록 뱃지 ✅ 승인완료
   - 미승인(rejected): 빨간 뱃지 ❌ + rejection_reason 표시 + 재제출 버튼
   - 대기중(pending): 노랑 뱃지 🕐 승인 대기중
3. **type='mission' & mission_subtype='video'**:
   - 영상 업로드 (기존 Mission.tsx 영상 업로드 로직 동일하게)
   - 나머지는 photo와 동일
4. **type='choice'**:
   - quiz.choices 배열로 라디오 버튼 렌더링
   - 선택 후 제출 → tanggo_answers에 INSERT
   - 이미 제출됨: 선택 잠금 + ✅ 제출완료 뱃지
5. **type='text'**:
   - textarea 입력
   - 제출 → tanggo_answers에 INSERT (checkAnswer 검증 없이 그냥 저장 — 관리자가 승인)
   - 이미 제출됨: 잠금

슬롯 카드 디자인: 흰 배경, rounded-2xl, border border-text-dark/10, 패딩 p-4, 슬롯 번호 뱃지.

---

### STEP 6: src/App.tsx 수정

기존 라우트에 아래 추가:
```typescript
import DaySelect from './pages/DaySelect'
import LocationSelect from './pages/LocationSelect'
import LocationMission from './pages/LocationMission'

// Routes 안에 추가:
<Route path="/day-select" element={<ParticipantGate><DaySelect /></ParticipantGate>} />
<Route path="/location-select" element={<ParticipantGate><LocationSelect /></ParticipantGate>} />
<Route path="/location-mission/:locationGroup" element={<ParticipantGate><LocationMission /></ParticipantGate>} />
```

---

### STEP 7: src/pages/Lobby.tsx 수정

fetchData 함수에서 event_config를 가져올 때 event_mode, days 필드도 함께 SELECT.

EventConfigRow 타입에 추가:
```typescript
event_mode: 'single' | 'multi_day'
```

computeState 함수에서 go_to_mission 반환 시 event_mode도 같이 반환:
```typescript
| { kind: 'go_to_mission'; eventMode: 'single' | 'multi_day' }
```

useEffect 리다이렉트 부분 수정:
```typescript
} else if (state.kind === 'go_to_mission') {
  if (state.eventMode === 'multi_day') {
    navigate('/day-select', { replace: true })
  } else {
    navigate('/mission', { replace: true })
  }
}
```

GoBlock의 goNow 함수도 동일하게 분기 처리.

---

### STEP 8: src/components/MissionApprovalQueue.tsx 수정

기존 미션 승인/미승인 UI에 아래를 추가:
- 미승인 버튼 클릭 시: 미승인 사유 입력 textarea 모달/인라인 펼침
- 사유 입력 후 [미승인 확정] 버튼 클릭 시: tanggo_mission_requests 업데이트 (status='rejected', rejection_reason=입력값, processed_at=now, processed_by=actorLabel)
- slot_label 필드가 있으면 카드 상단에 슬롯명 표시 (예: "케이블카 탑승 인증사진")
- 기존 승인 로직은 그대로 유지

---

### STEP 9: src/pages/admin/tabs/LocationAssign.tsx 신규 생성

관리자 장소 배정 탭:
- 좌측: 팀 목록 (tanggo_teams에서 SELECT)
- 팀 클릭 시 우측: 장소 목록 체크박스 (tanggo_quizzes에서 DISTINCT location_group WHERE day_number=2 SELECT)
- 체크박스 ON/OFF → tanggo_teams의 assigned_locations 컬럼 업데이트 (jsonb 배열)
- "전체 배정" / "전체 해제" 버튼
- 저장 시 토스트 "저장되었습니다 ✅"
- 팀별 현재 배정 장소 뱃지로 미리보기

---

### STEP 10: src/pages/admin/AdminDashboard.tsx 수정

기존 탭 배열에 LocationAssign 탭 추가:
```typescript
import LocationAssign from './tabs/LocationAssign'
// 탭 목록에 추가: { id: 'location-assign', label: '📍 장소 배정', component: <LocationAssign /> }
```

탭 순서는 팀 관리 탭 바로 다음에 추가.

---

### 완료 후 확인 사항
1. `npm run build` 에러 없는지 확인
2. 기존 single 모드(탐GO 5/21 방식) 정상 작동 확인 (event_mode='single'이면 DaySelect 안 거침)
3. `git add -A && git commit -m "feat: multi-day location mission (Phase 2)" && git push`
```

---

## 터미널 경로

```
cd C:\Users\user\Desktop\Projects\tanggo
```

Claude Code 실행 후 위 경로에서 이 파일 내용을 배치 명령으로 투입하면 됩니다.

---

## 참고: DB 컬럼 요약 (이미 적용 완료)

| 테이블 | 추가 컬럼 | 비고 |
|--------|----------|------|
| tanggo_event_config | event_mode ('single'\|'multi_day'), days (jsonb) | 기본값 'single' |
| tanggo_quizzes | day_number, location_group, location_group_order, slot_order, requires_approval_to_proceed, reference_images | 기존 40개 행 영향 없음 |
| tanggo_teams | assigned_locations (jsonb) | NULL = 전체 허용 |
| tanggo_mission_requests | rejection_reason, slot_label | 기존 승인 로직 호환 |

---

## 참고: 장소별 슬롯 구조 예시 (고창군 교류활동 기준)

관리자가 엑셀로 미션 등록 시 아래 패턴으로 입력:

| location_group | slot_order | type | mission_subtype | requires_approval_to_proceed | question |
|---------------|-----------|------|----------------|------------------------------|----------|
| 금강공원 | 1 | mission | photo | true | 미션 장소 입구에서 조원 다같이 사진을 찍어 올려주세요! |
| 금강공원 | 2 | mission | photo | false | 조원이 다같이 케이블카를 타는 모습을 찍어 올려주세요! |
| 금강공원 | 3 | mission | photo | false | 미션장소에서 조원이 다같이 나온 모습을 찍어 올려주세요! |
| 금강공원 | 4 | mission | photo | false | (공통미션) SNS에 업로드 한 공통미션 스크린샷을 올려주세요! |
| 복천박물관 | 1 | mission | photo | true | 미션 장소 입구에서 조원 다같이 사진을 찍어 올려주세요! |
| 복천박물관 | 2 | choice | null | false | 이 유물 중 실제로 복천박물관에 없는 가상의 유물은? |
| 복천박물관 | 3 | mission | photo | false | ... |

`reference_images` 예시 (복천박물관 객관식 슬롯):
```json
[
  {"label":"A. 덩이쇠","url":"https://xeavkglrclgrqmkxeivw.supabase.co/storage/v1/object/public/tanggo-mission-media/bokcheon_a.jpg"},
  {"label":"B. 화살통","url":"..."},
  {"label":"C. 천동칠두령","url":"..."},
  {"label":"D. 오리모양 토기","url":"..."},
  {"label":"E. 글자 있는 뚜껑 접시","url":"..."},
  {"label":"F. 가상의 유물","url":"..."}
]
```
