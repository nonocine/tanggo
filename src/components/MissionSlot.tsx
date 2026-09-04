import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Quiz, ReferenceImage } from '../lib/quizTypes'
import {
  MISSION_SUBTYPE_EMOJI,
  MISSION_SUBTYPE_LABEL,
  QUIZ_TYPE_EMOJI,
  QUIZ_TYPE_LABEL,
} from '../lib/quizTypes'
import {
  MAX_MISSION_MEDIA_BYTES,
  formatBytes,
  uploadMissionMedia,
} from '../lib/missionMedia'

export interface AnswerRow {
  id: string
  team_id: string
  quiz_id: string
  submitted: string
  is_correct: boolean
  answered_at: string
}

export interface MissionRequestRow {
  id: string
  team_id: string
  quiz_id: string
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  processed_at: string | null
  note: string | null
  media_url: string | null
  media_type: 'video' | 'photo' | null
  rejection_reason: string | null
  slot_label: string | null
}

/** 슬롯 이름 — 운영자 승인 화면 카드 상단에 표시된다 */
export function slotLabelOf(quiz: Quiz): string {
  return quiz.question.slice(0, 20)
}

/** 최신 미션 요청만 남긴 맵 (quiz_id → 요청) */
export function latestRequestByQuiz(
  rows: MissionRequestRow[],
): Map<string, MissionRequestRow> {
  const map = new Map<string, MissionRequestRow>()
  for (const r of rows) {
    const prev = map.get(r.quiz_id)
    if (!prev || r.requested_at > prev.requested_at) map.set(r.quiz_id, r)
  }
  return map
}

/** 슬롯 완료 여부 — 미션은 승인 기준, 객관식/주관식은 제출 기준 */
export function isSlotDone(
  quiz: Quiz,
  answer: AnswerRow | null | undefined,
  request: MissionRequestRow | null | undefined,
): boolean {
  if (quiz.type === 'mission') {
    return request?.status === 'approved' || !!answer
  }
  return !!answer
}

export interface MissionSlotProps {
  quiz: Quiz
  teamId: string
  /** 이미 제출된 요청 (최신 1건) */
  existingRequest: MissionRequestRow | null
  /** 이미 제출된 답변 */
  existingAnswer: AnswerRow | null
  /** requires_approval_to_proceed 게이트 */
  locked: boolean
  /** 표시용 번호 */
  slotIndex: number
  onChanged?: () => void
}

function SlotBadge({
  kind,
}: {
  kind: 'approved' | 'pending' | 'rejected' | 'submitted'
}) {
  if (kind === 'approved')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-mint-light text-[#2C7846]">
        ✅ 승인완료
      </span>
    )
  if (kind === 'pending')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F4C430]/20 text-[#A88300]">
        🕐 승인 대기중
      </span>
    )
  if (kind === 'rejected')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E94B3C]/15 text-[#E94B3C]">
        ❌ 미승인
      </span>
    )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-text-dark/10 text-text-dark/60">
      ✅ 제출완료
    </span>
  )
}

function ReferenceImageViewer({ images }: { images: ReferenceImage[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const open = openIdx !== null ? images[openIdx] : null

  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-text-dark/60 mb-1.5">
        🖼 참고 이미지 (탭하면 크게 보기)
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {images.map((img, idx) => (
          <button
            key={`${img.url}-${idx}`}
            type="button"
            onClick={() => setOpenIdx(idx)}
            className="shrink-0 w-24 rounded-xl overflow-hidden border-2 border-text-dark/10 bg-white hover:border-orange-main transition-colors"
          >
            <img
              src={img.url}
              alt={img.label || `참고 이미지 ${idx + 1}`}
              loading="lazy"
              className="w-full h-20 object-cover bg-black"
            />
            {img.label && (
              <span className="block px-1 py-1 text-[10px] font-bold text-text-dark/70 truncate">
                {img.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setOpenIdx(null)}
        >
          <div className="max-w-full max-h-full">
            <img
              src={open.url}
              alt={open.label || '참고 이미지'}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            {open.label && (
              <p className="mt-3 text-center text-sm font-bold text-white">
                {open.label}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpenIdx(null)}
            aria-label="닫기"
            className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 text-text-dark text-2xl"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default function MissionSlot({
  quiz,
  teamId,
  existingRequest,
  existingAnswer,
  locked,
  slotIndex,
  onChanged,
}: MissionSlotProps) {
  const [textAnswer, setTextAnswer] = useState('')
  const [choiceIdx, setChoiceIdx] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [resubmit, setResubmit] = useState(false)
  // photo_with_text — 사진과 함께 제출하는 유물 이름
  const [artifactName, setArtifactName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    }
  }, [mediaPreviewUrl])

  const subtype = quiz.type === 'mission' ? quiz.mission_subtype : null
  // 사진 + 유물 이름을 함께 제출하는 슬롯
  const isPhotoWithText = subtype === 'photo_with_text'
  const isUploadKind =
    subtype === 'video' || subtype === 'photo' || isPhotoWithText
  const refImages = quiz.reference_images ?? []

  const status = existingRequest?.status ?? null
  const approved =
    quiz.type === 'mission' && (status === 'approved' || !!existingAnswer)
  const pending = status === 'pending'
  const rejected = status === 'rejected' && !approved

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_MISSION_MEDIA_BYTES) {
      setError(
        `파일이 너무 커요 (${formatBytes(f.size)}). 50MB 이하로 올려주세요.`,
      )
      e.target.value = ''
      return
    }
    setError(null)
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(f)
    setMediaPreviewUrl(URL.createObjectURL(f))
  }

  function clearMedia() {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(null)
    setMediaPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleMissionSubmit() {
    if (submitting || uploading) return
    setError(null)

    let mediaUrl: string | null = null
    let mediaType: 'video' | 'photo' | null = null

    if (isPhotoWithText && !artifactName.trim()) {
      setError('유물 이름을 입력해주세요')
      return
    }

    if (isUploadKind) {
      if (!mediaFile) {
        setError(
          subtype === 'video' ? '영상을 선택해주세요' : '사진을 선택해주세요',
        )
        return
      }
      setUploading(true)
      try {
        const res = await uploadMissionMedia(mediaFile, teamId, quiz.id)
        mediaUrl = res.url
        // media_type 컬럼은 video/photo 만 허용 — photo_with_text 도 사진으로 저장
        mediaType = isPhotoWithText ? 'photo' : subtype
      } catch (e) {
        setError(
          `업로드 실패. 다시 시도해주세요${
            e instanceof Error ? ` (${e.message})` : ''
          }`,
        )
        setUploading(false)
        return
      }
      setUploading(false)
    }

    setSubmitting(true)
    const { error: insertErr } = await supabase
      .from('tanggo_mission_requests')
      .insert({
        team_id: teamId,
        quiz_id: quiz.id,
        status: 'pending',
        media_url: mediaUrl,
        media_type: mediaType,
        // 승인 화면에서 어떤 유물인지 바로 보이도록 유물 이름을 슬롯 이름으로 쓴다
        slot_label: isPhotoWithText ? artifactName.trim() : slotLabelOf(quiz),
        note: isPhotoWithText ? artifactName.trim() : null,
      })
    setSubmitting(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    clearMedia()
    setArtifactName('')
    setResubmit(false)
    onChanged?.()
  }

  async function handleAnswerSubmit(submitted: string) {
    if (submitting || !submitted.trim()) return
    setSubmitting(true)
    setError(null)
    // 정답 검증 없이 저장 — 판정은 관리자가 한다
    const { error: insertErr } = await supabase.from('tanggo_answers').insert({
      team_id: teamId,
      quiz_id: quiz.id,
      submitted: submitted.trim(),
      is_correct: false,
      answered_at: new Date().toISOString(),
    })
    setSubmitting(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    onChanged?.()
  }

  /* ── 1) 잠금 ──────────────────────────────────────── */
  if (locked) {
    return (
      <li className="rounded-2xl border border-text-dark/10 bg-text-dark/[0.04] p-4">
        <div className="flex items-start gap-2">
          <span className="w-6 h-6 shrink-0 mt-0.5 inline-flex items-center justify-center rounded-full bg-text-dark/15 text-text-dark/50 text-xs font-black tabular-nums">
            {slotIndex}
          </span>
          <p className="text-sm font-bold text-text-dark/40 line-clamp-2">
            🔒 {quiz.question}
          </p>
        </div>
        <p className="mt-2 text-xs font-semibold text-text-dark/40">
          이전 단계 승인 후 진행 가능
        </p>
      </li>
    )
  }

  const editable = !status || (rejected && resubmit)
  const showUploader = (subtype === 'video' || subtype === 'photo') && editable
  const showPhotoWithText = isPhotoWithText && editable
  const showVerifyButton = subtype === 'verify' && editable

  return (
    <li className="rounded-2xl border border-text-dark/10 bg-white p-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="w-6 h-6 shrink-0 mt-0.5 inline-flex items-center justify-center rounded-full bg-orange-main text-white text-xs font-black tabular-nums">
            {slotIndex}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-text-dark/50">
              <span aria-hidden className="mr-1">
                {subtype
                  ? MISSION_SUBTYPE_EMOJI[subtype]
                  : QUIZ_TYPE_EMOJI[quiz.type]}
              </span>
              {subtype
                ? MISSION_SUBTYPE_LABEL[subtype]
                : QUIZ_TYPE_LABEL[quiz.type]}
            </p>
            <p className="mt-0.5 text-sm font-bold text-text-dark whitespace-pre-wrap">
              {quiz.question}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {approved ? (
            <SlotBadge kind="approved" />
          ) : pending ? (
            <SlotBadge kind="pending" />
          ) : rejected ? (
            <SlotBadge kind="rejected" />
          ) : existingAnswer ? (
            <SlotBadge kind="submitted" />
          ) : null}
        </div>
      </div>

      {quiz.location_hint && (
        <p className="mt-2 text-xs font-bold text-text-dark/60">
          📍 {quiz.location_hint}
        </p>
      )}

      {/* 참고 이미지 */}
      {refImages.length > 0 && <ReferenceImageViewer images={refImages} />}

      {/* ── 현장 미션 (사진/영상/직접 인증) ─────────────── */}
      {quiz.type === 'mission' && (
        <>
          {approved && (
            <div className="mt-3 p-3 rounded-xl bg-mint-light/50">
              <p className="text-sm font-bold text-[#2C7846]">✅ 승인 완료</p>
              <p className="mt-0.5 text-xs text-text-dark/60">
                운영자 확인이 끝났어요. 다음 미션으로 진행하세요!
              </p>
            </div>
          )}

          {isPhotoWithText && !editable && existingRequest?.slot_label && (
            <div className="mt-3 p-3 rounded-xl bg-text-dark/5">
              <p className="text-sm font-bold text-text-dark/60">
                🔒 제출한 유물 이름
              </p>
              <p className="mt-0.5 text-sm font-bold text-text-dark">
                🏺 {existingRequest.slot_label}
              </p>
              {existingRequest.media_url && (
                <img
                  src={existingRequest.media_url}
                  alt="제출한 유물 사진"
                  loading="lazy"
                  className="mt-2 w-full rounded-lg bg-black max-h-60 object-contain"
                />
              )}
            </div>
          )}

          {pending && (
            <div className="mt-3 p-3 rounded-xl bg-[#F4C430]/15">
              <p className="text-sm font-bold text-[#A88300]">🕐 승인 대기중</p>
              <p className="mt-0.5 text-xs text-text-dark/70">
                운영자가 확인하면 자동으로 승인 처리됩니다
              </p>
            </div>
          )}

          {rejected && (
            <div className="mt-3 p-3 rounded-xl bg-[#E94B3C]/10">
              <p className="text-sm font-bold text-[#E94B3C]">❌ 미승인</p>
              {(existingRequest?.rejection_reason ?? existingRequest?.note) && (
                <p className="mt-1 text-xs text-text-dark/70 whitespace-pre-wrap">
                  사유: {existingRequest?.rejection_reason ?? existingRequest?.note}
                </p>
              )}
              {!resubmit && (
                <button
                  type="button"
                  onClick={() => setResubmit(true)}
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-main text-white hover:bg-orange-sub"
                >
                  🔄 다시 제출하기
                </button>
              )}
            </div>
          )}

          {showUploader && (
            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={subtype === 'video' ? 'video/*' : 'image/*'}
                className="hidden"
                onChange={onFilePicked}
              />

              {!mediaFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-3.5 rounded-xl border-2 border-dashed border-orange-main/50 bg-orange-main/5 text-orange-main text-sm font-bold hover:bg-orange-main/10 active:scale-[0.99] transition-all"
                >
                  {subtype === 'video'
                    ? '📹 영상 찍기 / 갤러리에서 선택'
                    : '📷 사진 찍기 / 갤러리에서 선택'}
                </button>
              ) : (
                <div className="rounded-xl bg-cream p-3">
                  {subtype === 'video' && mediaPreviewUrl && (
                    <video
                      src={mediaPreviewUrl}
                      controls
                      playsInline
                      className="w-full rounded-lg bg-black max-h-60 object-contain"
                    />
                  )}
                  {subtype === 'photo' && mediaPreviewUrl && (
                    <img
                      src={mediaPreviewUrl}
                      alt="선택한 사진 미리보기"
                      className="w-full rounded-lg bg-black max-h-60 object-contain"
                    />
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-dark truncate">
                        {mediaFile.name}
                      </p>
                      <p className="text-[11px] text-text-dark/60 tabular-nums">
                        {formatBytes(mediaFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearMedia}
                      disabled={uploading}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 hover:bg-white text-text-dark/70 disabled:opacity-50"
                    >
                      다시 선택
                    </button>
                  </div>
                </div>
              )}

              {uploading && (
                <div className="mt-2 p-3 rounded-xl bg-orange-main/10">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-orange-main border-t-transparent animate-spin" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-orange-main">
                        업로드 중...
                      </p>
                      <p className="text-[11px] text-text-dark/60">
                        잠시만 기다려주세요. 화면을 닫지 마세요.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleMissionSubmit}
                disabled={!mediaFile || submitting || uploading}
                className={`mt-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                  !mediaFile || submitting || uploading
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.99]'
                }`}
              >
                {uploading
                  ? '업로드 중...'
                  : submitting
                    ? '제출 중...'
                    : '📡 업로드 후 제출'}
              </button>
            </div>
          )}

          {showPhotoWithText && (
            <div className="mt-3 space-y-3">
              {/* 사진 업로드 */}
              <div>
                <p className="text-sm font-bold text-text-dark mb-2">
                  📷 유물 사진
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onFilePicked}
                />
                {!mediaFile ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-3.5 rounded-xl border-2 border-dashed border-orange-main/50 bg-orange-main/5 text-orange-main text-sm font-bold hover:bg-orange-main/10 active:scale-[0.99] transition-all"
                  >
                    📷 사진 찍기 / 갤러리에서 선택
                  </button>
                ) : (
                  <div className="rounded-xl bg-cream p-3">
                    {mediaPreviewUrl && (
                      <img
                        src={mediaPreviewUrl}
                        alt="선택한 사진 미리보기"
                        className="w-full rounded-lg bg-black max-h-60 object-contain"
                      />
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-text-dark truncate">
                          {mediaFile.name}
                        </p>
                        <p className="text-[11px] text-text-dark/60 tabular-nums">
                          {formatBytes(mediaFile.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearMedia}
                        disabled={uploading}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 hover:bg-white text-text-dark/70 disabled:opacity-50"
                      >
                        다시 선택
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 유물 이름 입력 */}
              <div>
                <p className="text-sm font-bold text-text-dark mb-2">
                  ✏️ 유물 이름
                </p>
                <input
                  type="text"
                  placeholder="유물 이름을 입력해주세요"
                  value={artifactName}
                  onChange={(e) => setArtifactName(e.target.value)}
                  disabled={uploading || submitting}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-text-dark/20 bg-white text-sm font-medium text-text-dark placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 disabled:opacity-50"
                />
              </div>

              {uploading && (
                <div className="p-3 rounded-xl bg-orange-main/10">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-orange-main border-t-transparent animate-spin" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-orange-main">
                        업로드 중...
                      </p>
                      <p className="text-[11px] text-text-dark/60">
                        잠시만 기다려주세요. 화면을 닫지 마세요.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 제출 버튼 */}
              <button
                type="button"
                onClick={handleMissionSubmit}
                disabled={
                  !mediaFile || !artifactName.trim() || submitting || uploading
                }
                className="w-full py-3 rounded-2xl bg-orange-main text-white text-sm font-bold hover:bg-orange-sub active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-orange-main"
              >
                {uploading
                  ? '업로드 중...'
                  : submitting
                    ? '제출 중...'
                    : '제출하기'}
              </button>
            </div>
          )}

          {showVerifyButton && (
            <div className="mt-3">
              <div className="p-3 rounded-xl bg-cream">
                <p className="text-xs text-text-dark/70 leading-relaxed">
                  ✋ 운영자에게 직접 보여주고 인증받으세요. 아래 버튼으로 완료
                  요청을 보낼 수 있어요.
                </p>
              </div>
              <button
                type="button"
                onClick={handleMissionSubmit}
                disabled={submitting}
                className={`mt-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                  submitting
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.99]'
                }`}
              >
                {submitting ? '요청 중...' : '📡 완료 요청 보내기'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── 객관식 ──────────────────────────────────────── */}
      {quiz.type === 'choice' && quiz.choices && (
        <div className="mt-3">
          {existingAnswer ? (
            <div className="p-3 rounded-xl bg-text-dark/5">
              <p className="text-sm font-bold text-text-dark/60">🔒 제출 완료</p>
              <p className="mt-0.5 text-xs text-text-dark/60">
                제출한 답:{' '}
                {quiz.choices[Number(existingAnswer.submitted) - 1] ??
                  existingAnswer.submitted}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {quiz.choices.map((c, idx) => {
                  const selected = choiceIdx === idx
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setChoiceIdx(idx)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${
                        selected
                          ? 'border-orange-main bg-orange-main/5'
                          : 'border-text-dark/10 hover:border-orange-main/40'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full text-[11px] font-black tabular-nums ${
                          selected
                            ? 'bg-orange-main text-white'
                            : 'bg-text-dark/10 text-text-dark/60'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-text-dark">
                        {c}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => handleAnswerSubmit(String((choiceIdx ?? 0) + 1))}
                disabled={choiceIdx === null || submitting}
                className={`mt-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                  choiceIdx === null || submitting
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.99]'
                }`}
              >
                {submitting ? '제출 중...' : '제출'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── 주관식 ──────────────────────────────────────── */}
      {quiz.type === 'text' && (
        <div className="mt-3">
          {existingAnswer ? (
            <div className="p-3 rounded-xl bg-text-dark/5">
              <p className="text-sm font-bold text-text-dark/60">🔒 제출 완료</p>
              <p className="mt-0.5 text-xs text-text-dark/60 whitespace-pre-wrap">
                제출한 답: {existingAnswer.submitted}
              </p>
            </div>
          ) : (
            <>
              <textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                rows={3}
                placeholder="답변을 입력하세요"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-text-dark/10 bg-white text-sm font-medium placeholder:text-text-dark/30 focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20 resize-y"
              />
              <button
                type="button"
                onClick={() => handleAnswerSubmit(textAnswer)}
                disabled={!textAnswer.trim() || submitting}
                className={`mt-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                  !textAnswer.trim() || submitting
                    ? 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
                    : 'bg-orange-main text-white hover:bg-orange-sub active:scale-[0.99]'
                }`}
              >
                {submitting ? '제출 중...' : '제출'}
              </button>
            </>
          )}
        </div>
      )}

      {quiz.hint && <p className="mt-3 text-xs text-text-dark/50">💡 {quiz.hint}</p>}

      {error && <p className="mt-2 text-xs font-semibold text-[#E94B3C]">{error}</p>}
    </li>
  )
}
