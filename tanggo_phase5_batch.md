# 탐GO — Phase 5 배치 명령
> Claude Code 터미널에서 실행. 경로: `C:\Users\user\Desktop\Projects\tanggo`
> DB 완료: 8개 장소 전체 미션 등록됨 (금강공원4, 복천박물관9, 해양자연사박물관6, 충렬사5, 동래읍성8, 동래향교8, 박차정생가5, 동래부동헌5)

---

아래 내용을 Claude Code에 그대로 붙여넣어 실행해줘.

```
tanggo 프로젝트에 아래 2가지를 구현해줘.
기존 코드 스타일(Tailwind, 한국어 UI, bg-cream, 오렌지 #FF6B47) 유지.

---

### STEP 1: 일차 선택 버튼 상호 비활성화 — src/pages/DaySelect.tsx

현재 DaySelect는 1일차/2일차 버튼을 둘 다 항상 활성화 상태로 보여준다.
수정: 팀이 이미 특정 일차에서 미션을 진행한 적 있으면 해당 일차 버튼만 활성화하고
다른 일차 버튼은 비활성화(회색, 클릭 불가).

판단 기준:
- `tanggo_answers` 테이블에서 현재 teamId로 제출된 답변 중
  해당 quiz의 day_number를 JOIN해서 어떤 day를 진행했는지 확인
- `tanggo_mission_requests` 테이블에서도 동일하게 확인
- 둘 다 0건이면 → 아직 아무것도 안 했으므로 둘 다 활성화 (자유 선택)
- 1일차 진행 기록 있으면 → 1일차 버튼만 활성, 2일차 버튼 비활성
- 2일차 진행 기록 있으면 → 2일차 버튼만 활성, 1일차 버튼 비활성

비활성화 버튼 UI:
```tsx
<button
  disabled
  className="... opacity-40 cursor-not-allowed grayscale"
>
  2일차
  <span className="text-xs block mt-1">1일차 진행 중</span>
</button>
```

컴포넌트 마운트 시 위 체크를 수행하는 useEffect + useState(activatedDay: 1 | 2 | null) 추가.
로딩 중에는 버튼에 스피너 표시.

---

### STEP 2: 관리자 퀴즈 모달에 참고 이미지 업로드 UI 추가

관리자가 퀴즈 등록/수정 시 reference_images(참고 이미지)를 직접 업로드할 수 있게 한다.
복천박물관 유물 사진 A~F처럼 미션 안에 보여줄 이미지를 관리자가 직접 올리는 기능.

#### 2-A: src/pages/admin/tabs/QuizManager.tsx (또는 QuizFormModal.tsx) 수정

퀴즈 등록/수정 폼에 아래 UI 섹션 추가:

```
📎 참고 이미지 (선택)
미션 화면에 표시할 참고 이미지를 업로드하세요 (유물 사진, 확대사진 등)

[이미지 추가 +]

① [이미지 미리보기] [레이블 입력: A. 덩이쇠] [삭제 ✕]
② [이미지 미리보기] [레이블 입력: B. 화살통] [삭제 ✕]
```

상태 관리:
```typescript
interface RefImage {
  label: string
  url: string       // 업로드 완료 후 Storage URL
  file?: File       // 업로드 전 로컬 파일
  uploading?: boolean
}
const [refImages, setRefImages] = useState<RefImage[]>([])
```

이미지 추가 버튼 클릭 → input[type=file] accept="image/*" 트리거
파일 선택 시:
1. 로컬 미리보기(URL.createObjectURL) 즉시 표시
2. Supabase Storage `tanggo-mission-media` 버킷에 업로드
   경로: `reference/${quizId || 'new'}/${Date.now()}_${file.name}`
3. 업로드 완료 → url을 Storage public URL로 교체

레이블 입력창: placeholder="예: A. 덩이쇠" (자유 텍스트)

저장 시: refImages 배열을 `[{label, url}]` 형태로 변환해 quiz의 reference_images 컬럼에 저장

기존 퀴즈 수정 시: reference_images가 있으면 refImages state에 로드해서 표시

#### 2-B: Supabase Storage 업로드 헬퍼

기존 missionMedia.ts에 아래 함수 추가:
```typescript
export async function uploadReferenceImage(
  file: File,
  quizId: string,
): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `reference/${quizId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('tanggo-mission-media')
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage
    .from('tanggo-mission-media')
    .getPublicUrl(path)
  return data.publicUrl
}
```

---

### STEP 3: 빌드 확인 및 커밋

```bash
npm run build
git add src/
git commit -m "feat: 일차 버튼 상호 비활성화 + 관리자 참고이미지 업로드 (Phase 5)"
git push
```
```

---

## DB 완료 내용 (이미 적용됨)

| 장소 | 슬롯 수 | 특이사항 |
|------|--------|---------|
| 금강공원 | 4 | 도착인증(관문)+케이블카+조별+공통 |
| 복천박물관 | 9 | 도착인증(관문)+객관식+유물5세트+조별+공통 |
| 해양자연사박물관 | 6 | 도착인증(관문)+글자찾기+출처+완성문장+조별+공통 |
| 충렬사 | 5 | 도착인증(관문)+주관식+근거사진+조별+공통 |
| 동래읍성 | 8 | 도착인증(관문)+photo_with_text×5+조별+공통 |
| 동래향교 | 8 | 도착인증(관문)+photo_with_text×5+조별+공통 |
| 박차정생가 | 5 | 도착인증(관문)+영상+역사의미입력+조별+공통 |
| 동래부동헌 | 5 | 도착인증(관문)+영상+역사의미입력+조별+공통 |
