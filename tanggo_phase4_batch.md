# 탐GO — Phase 4 배치 명령 (김민정 수정 요청)
> Claude Code 터미널에서 실행. 경로: `C:\Users\user\Desktop\Projects\tanggo`
> DB 작업 완료:
> - mission_subtype 제약에 'photo_with_text' 추가
> - 복천박물관 객관식 보기 A~F만 표시로 수정
> - 복천박물관 유물 슬롯 5세트(photo_with_text) + 조별인증 + 공통미션 재구성

---

아래 내용을 Claude Code에 그대로 붙여넣어 실행해줘.

```
tanggo 프로젝트(React 19 + TypeScript + Vite + Supabase + Tailwind CSS 4)에서
김민정 수정 요청 4가지를 순서대로 구현해줘.
기존 코드 스타일(Tailwind, 한국어 UI, bg-cream, 오렌지 #FF6B47) 유지.

---

### STEP 1: 1일차 미션 "등록된 미션이 없어요" 버그 수정 — src/pages/Mission.tsx

문제: 1일차 클릭 시 URL이 /mission?day=1 인데,
Mission.tsx에서 퀴즈를 불러올 때 day_number 필터가 제대로 안 걸려서
"등록된 미션이 없어요" 가 뜨는 버그.

수정 내용:
Mission.tsx의 fetchData 내 tanggo_quizzes SELECT 쿼리에서
searchParams.get('day') 값을 읽어 필터 적용:

```typescript
const dayParam = searchParams.get('day') // '1' | '2' | null

let quizQuery = supabase
  .from('tanggo_quizzes')
  .select('*')
  .eq('is_active', true)
  .order('order_num')

if (dayParam) {
  // day 파라미터가 있으면 해당 day_number만
  quizQuery = quizQuery.eq('day_number', parseInt(dayParam))
} else {
  // 없으면 기존 탐GO single 모드: day_number가 null인 것만
  quizQuery = quizQuery.is('day_number', null)
}
```

---

### STEP 2: 행사 시작 후 새로 생성된 팀 자동 시작 처리 — src/pages/TeamCreate.tsx

문제: 관리자가 '행사 시작' 버튼을 누른 뒤 새로 팀을 만들면,
해당 팀은 별도로 관리자가 또 '행사 시작'을 눌러줘야 미션 진행 가능.

수정 내용:
TeamCreate.tsx의 handleSubmit에서 팀 INSERT 직후,
tanggo_event_config에서 started_at을 조회해서
이미 행사가 시작된 상태면 해당 팀의 started_at도 즉시 now()로 설정:

```typescript
// 팀 생성 후
const { data: config } = await supabase
  .from('tanggo_event_config')
  .select('started_at, finished_at')
  .eq('id', 1)
  .maybeSingle()

if (config?.started_at && !config?.finished_at) {
  // 행사 진행 중이면 팀도 바로 시작 처리
  await supabase
    .from('tanggo_teams')
    .update({ started_at: new Date().toISOString() })
    .eq('id', team.id)
}
```

---

### STEP 3: 모든 미션 페이지 하단에 네비게이션 버튼 추가

#### 3-A: src/pages/Mission.tsx 하단 버튼 추가

미션 카드 그리드 하단(또는 완료 모달 외부 고정 영역)에 두 버튼 추가:

```tsx
{/* 하단 네비게이션 */}
<div className="flex gap-3 mt-8 pb-8">
  <button
    onClick={() => navigate('/lobby')}
    className="flex-1 py-3 rounded-2xl border-2 border-text-dark/20 text-text-dark font-bold"
  >
    🏠 대기실로 돌아가기
  </button>
  {searchParams.get('day') && (
    <button
      onClick={() => navigate('/day-select')}
      className="flex-1 py-3 rounded-2xl border-2 border-orange-main text-orange-main font-bold"
    >
      📅 일차 선택하기
    </button>
  )}
</div>
```

버튼 클릭 후 다시 미션으로 돌아와도 기존 진행 상황(제출한 답, 승인 상태) 유지됨
— 이건 이미 DB에서 불러오는 구조라 별도 처리 불필요.

#### 3-B: src/pages/LocationMission.tsx 하단 버튼 추가

기존 "← 장소 선택" 뒤로가기 버튼 외에 하단에도 추가:

```tsx
<div className="flex gap-3 mt-8 pb-8">
  <button
    onClick={() => navigate('/lobby')}
    className="flex-1 py-3 rounded-2xl border-2 border-text-dark/20 text-text-dark font-bold"
  >
    🏠 대기실로 돌아가기
  </button>
  <button
    onClick={() => navigate('/day-select')}
    className="flex-1 py-3 rounded-2xl border-2 border-orange-main text-orange-main font-bold"
  >
    📅 일차 선택하기
  </button>
</div>
```

#### 3-C: src/pages/LocationSelect.tsx 하단 버튼 추가

장소 목록 하단에:

```tsx
<div className="flex gap-3 mt-8 pb-8">
  <button
    onClick={() => navigate('/lobby')}
    className="flex-1 py-3 rounded-2xl border-2 border-text-dark/20 text-text-dark font-bold"
  >
    🏠 대기실로 돌아가기
  </button>
  <button
    onClick={() => navigate('/day-select')}
    className="flex-1 py-3 rounded-2xl border-2 border-orange-main text-orange-main font-bold"
  >
    📅 일차 선택하기
  </button>
</div>
```

---

### STEP 4: photo_with_text 슬롯 렌더링 — src/components/MissionSlot.tsx

DB에 mission_subtype = 'photo_with_text' 슬롯이 추가됨.
MissionSlot.tsx에서 이 타입을 처리하는 케이스 추가:

**렌더링:**
```tsx
{quiz.mission_subtype === 'photo_with_text' && (
  <div className="space-y-3">
    {/* 사진 업로드 */}
    <div>
      <p className="text-sm font-bold text-text-dark mb-2">📷 유물 사진</p>
      {/* 기존 photo 업로드 UI 동일하게 */}
    </div>
    {/* 유물 이름 입력 */}
    <div>
      <p className="text-sm font-bold text-text-dark mb-2">✏️ 유물 이름</p>
      <input
        type="text"
        placeholder="유물 이름을 입력해주세요"
        value={artifactName}
        onChange={(e) => setArtifactName(e.target.value)}
        className="w-full px-4 py-3 rounded-2xl border-2 border-text-dark/20 bg-white text-text-dark"
        disabled={isSubmitted}
      />
    </div>
    {/* 제출 버튼 */}
    {!isSubmitted && (
      <button
        onClick={handlePhotoWithTextSubmit}
        disabled={!uploadedUrl || !artifactName.trim()}
        className="w-full py-3 rounded-2xl bg-orange-main text-white font-bold disabled:opacity-40"
      >
        제출하기
      </button>
    )}
  </div>
)}
```

**상태 관리:**
- `artifactName` state 추가 (string)
- `uploadedUrl` state 추가 (string | null) — 사진 업로드 완료 후 URL 저장
- `handlePhotoWithTextSubmit`: tanggo_mission_requests INSERT 시
  `slot_label`에 유물 이름 포함:
  ```typescript
  slot_label: artifactName.trim()
  // note 필드에도 저장: note: artifactName.trim()
  ```
- 이미 제출된 경우(existingRequest 있음): 사진 + 이름 잠금 표시, 승인 상태 뱃지

관리자 승인 화면(MissionApprovalQueue)에서 slot_label로 유물 이름이 표시되므로
관리자가 어떤 유물인지 바로 확인 가능.

---

### STEP 5: 빌드 확인 및 커밋

```bash
npm run build
git add src/
git commit -m "fix: 1일차 미션 버그 + 행사 시작 후 팀 자동 시작 + 네비 버튼 + photo_with_text 슬롯 (Phase 4)"
git push
```
```

---

## DB 완료 내용 (이미 적용됨)

| 작업 | 상태 |
|------|------|
| mission_subtype 제약에 'photo_with_text' 추가 | ✅ |
| 복천박물관 객관식 보기 A→F만 표시 | ✅ |
| 복천박물관 유물 슬롯 5세트(photo_with_text) 재구성 | ✅ |
| 복천박물관 조별인증 + 공통미션 슬롯 | ✅ |

## 복천박물관 최종 슬롯 구조

| slot | subtype | 내용 |
|------|---------|------|
| 1 | photo | 도착인증 (관문) |
| 2 | choice | 가짜 유물 찾기 A~F |
| 3~7 | photo_with_text | 실제 유물 사진+이름 5세트 |
| 8 | photo | 조별 인증사진 |
| 9 | photo | 공통미션 SNS |
