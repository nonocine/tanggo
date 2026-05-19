import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { APP_CONFIG } from '../../../config/appConfig'
import { MISSION_MEDIA_BUCKET } from '../../../lib/missionMedia'
import { todayStamp } from '../../../lib/quizExcel'

interface Counts {
  teams: number
  members: number
  quizzesTotal: number
  quizzesActive: number
  answers: number
  missionRequests: number
  hintRequests: number
  surveyQuestions: number
  surveyResponses: number
  mediaFiles: number
}

const ZERO: Counts = {
  teams: 0,
  members: 0,
  quizzesTotal: 0,
  quizzesActive: 0,
  answers: 0,
  missionRequests: 0,
  hintRequests: 0,
  surveyQuestions: 0,
  surveyResponses: 0,
  mediaFiles: 0,
}

async function countOf(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

async function countActiveQuizzes(): Promise<number> {
  const { count, error } = await supabase
    .from('tanggo_quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) throw new Error(`tanggo_quizzes(active): ${error.message}`)
  return count ?? 0
}

async function listAllMediaPaths(): Promise<string[]> {
  const paths: string[] = []
  let offset = 0
  const pageSize = 100
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase.storage
      .from(MISSION_MEDIA_BUCKET)
      .list('', { limit: pageSize, offset })
    if (error) throw new Error(`storage list: ${error.message}`)
    const items = data ?? []
    for (const it of items) {
      if (it.name) paths.push(it.name)
    }
    if (items.length < pageSize) break
    offset += pageSize
  }
  return paths
}

export default function DataManager() {
  const [counts, setCounts] = useState<Counts>(ZERO)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 진행 중 작업 이름
  const [toast, setToast] = useState<string | null>(null)

  // 테스트 팀 삭제용
  const [testFilter, setTestFilter] = useState('테스트')
  const [matchedTeams, setMatchedTeams] = useState<
    { id: string; team_name: string }[]
  >([])
  const [previewLoaded, setPreviewLoaded] = useState(false)

  // 전체 초기화 확인 입력
  const [resetConfirmInput, setResetConfirmInput] = useState('')
  const RESET_TOKEN = '초기화'

  const fetchCounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        teams,
        members,
        quizzesTotal,
        quizzesActive,
        answers,
        missionRequests,
        hintRequests,
        surveyQuestions,
        surveyResponses,
        mediaPaths,
      ] = await Promise.all([
        countOf('tanggo_teams'),
        countOf('tanggo_team_members'),
        countOf('tanggo_quizzes'),
        countActiveQuizzes(),
        countOf('tanggo_answers'),
        countOf('tanggo_mission_requests'),
        countOf('tanggo_hint_requests'),
        countOf('tanggo_survey_questions'),
        countOf('tanggo_survey_responses'),
        listAllMediaPaths().then((p) => p.length),
      ])
      setCounts({
        teams,
        members,
        quizzesTotal,
        quizzesActive,
        answers,
        missionRequests,
        hintRequests,
        surveyQuestions,
        surveyResponses,
        mediaFiles: mediaPaths,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '집계 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ──────────────── 선택적 삭제 ────────────────

  async function previewMatchedTeams() {
    const term = testFilter.trim()
    if (!term) {
      setMatchedTeams([])
      setPreviewLoaded(true)
      return
    }
    const { data, error } = await supabase
      .from('tanggo_teams')
      .select('id, team_name')
      .ilike('team_name', `%${term}%`)
      .order('team_name')
    if (error) {
      setToast(`조회 실패: ${error.message}`)
      return
    }
    setMatchedTeams((data ?? []) as { id: string; team_name: string }[])
    setPreviewLoaded(true)
  }

  async function deleteMatchedTeams() {
    if (matchedTeams.length === 0) {
      setToast('삭제 대상이 없어요. 먼저 미리보기로 확인하세요.')
      return
    }
    const ok = window.confirm(
      `${matchedTeams.length}개 팀과 관련 답안/팀원/요청을 모두 삭제합니다.\n\n계속할까요?`,
    )
    if (!ok) return
    setBusy('test-teams')
    try {
      const ids = matchedTeams.map((t) => t.id)
      // child rows first
      const childErrors = await Promise.all([
        supabase.from('tanggo_answers').delete().in('team_id', ids).then((r) => r.error),
        supabase.from('tanggo_team_members').delete().in('team_id', ids).then((r) => r.error),
        supabase.from('tanggo_mission_requests').delete().in('team_id', ids).then((r) => r.error),
        supabase.from('tanggo_hint_requests').delete().in('team_id', ids).then((r) => r.error),
        supabase.from('tanggo_survey_responses').delete().in('team_id', ids).then((r) => r.error),
      ])
      for (const e of childErrors) {
        if (e) throw new Error(e.message)
      }
      const { error: teamErr } = await supabase
        .from('tanggo_teams')
        .delete()
        .in('id', ids)
      if (teamErr) throw new Error(teamErr.message)
      setToast(`✅ ${ids.length}개 팀 삭제 완료`)
      setMatchedTeams([])
      setPreviewLoaded(false)
      fetchCounts()
    } catch (e) {
      setToast(`삭제 실패: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setBusy(null)
    }
  }

  async function deleteAllMedia() {
    const ok = window.confirm(
      '업로드된 모든 미션 미디어 파일을 삭제하고, mission_requests의 미디어 참조도 비웁니다.\n계속할까요?',
    )
    if (!ok) return
    setBusy('media')
    try {
      const paths = await listAllMediaPaths()
      if (paths.length > 0) {
        const { error } = await supabase.storage
          .from(MISSION_MEDIA_BUCKET)
          .remove(paths)
        if (error) throw new Error(error.message)
      }
      // mission_requests 미디어 참조 비우기
      const { error: updErr } = await supabase
        .from('tanggo_mission_requests')
        .update({ media_url: null, media_type: null })
        .not('media_url', 'is', null)
      if (updErr) throw new Error(updErr.message)
      setToast(`✅ 미디어 ${paths.length}개 파일 삭제 완료`)
      fetchCounts()
    } catch (e) {
      setToast(`삭제 실패: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setBusy(null)
    }
  }

  async function deleteAllSurveyResponses() {
    const ok = window.confirm(
      '모든 설문 응답을 삭제합니다. 설문 질문은 유지됩니다.\n계속할까요?',
    )
    if (!ok) return
    setBusy('survey-resp')
    try {
      // .delete() 는 WHERE 가 필요 — 모두 지우려면 항상 참인 조건 사용
      const { error } = await supabase
        .from('tanggo_survey_responses')
        .delete()
        .not('id', 'is', null)
      if (error) throw new Error(error.message)
      // localStorage의 보고서 서술형 override도 함께 비우는 게 자연스럽다 — 통계가 변하니까
      setToast('✅ 모든 설문 응답 삭제 완료')
      fetchCounts()
    } catch (e) {
      setToast(`삭제 실패: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setBusy(null)
    }
  }

  // ──────────────── 전체 초기화 ────────────────

  async function fullReset() {
    if (resetConfirmInput.trim() !== RESET_TOKEN) {
      setToast(`"${RESET_TOKEN}" 을 정확히 입력해주세요`)
      return
    }
    const ok = window.confirm(
      [
        '⚠ 전체 초기화를 진행합니다.',
        '',
        '삭제되는 항목:',
        '· 모든 팀, 팀원',
        '· 모든 답안',
        '· 모든 미션 요청',
        '· 모든 힌트 요청',
        '· 모든 설문 응답',
        '· 모든 업로드 미디어 파일',
        '',
        '유지되는 항목:',
        '· 미션 정의',
        '· 설문 질문',
        '· 행사 설정',
        '',
        '되돌릴 수 없습니다. 정말 진행할까요?',
      ].join('\n'),
    )
    if (!ok) return
    setBusy('full-reset')
    try {
      // child → parent 순으로 삭제
      const childErrors = await Promise.all([
        supabase.from('tanggo_answers').delete().not('id', 'is', null).then((r) => r.error),
        supabase.from('tanggo_mission_requests').delete().not('id', 'is', null).then((r) => r.error),
        supabase.from('tanggo_hint_requests').delete().not('id', 'is', null).then((r) => r.error),
        supabase.from('tanggo_survey_responses').delete().not('id', 'is', null).then((r) => r.error),
        supabase.from('tanggo_team_members').delete().not('id', 'is', null).then((r) => r.error),
      ])
      for (const e of childErrors) {
        if (e) throw new Error(e.message)
      }
      const { error: teamErr } = await supabase
        .from('tanggo_teams')
        .delete()
        .not('id', 'is', null)
      if (teamErr) throw new Error(teamErr.message)

      // 미디어 파일
      const paths = await listAllMediaPaths()
      if (paths.length > 0) {
        const { error: mErr } = await supabase.storage
          .from(MISSION_MEDIA_BUCKET)
          .remove(paths)
        if (mErr) throw new Error(mErr.message)
      }

      setToast('✅ 전체 초기화 완료')
      setResetConfirmInput('')
      fetchCounts()
    } catch (e) {
      setToast(`초기화 실패: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setBusy(null)
    }
  }

  // ──────────────── JSON 백업 ────────────────

  async function downloadBackup() {
    setBusy('backup')
    try {
      const [
        teams,
        members,
        quizzes,
        answers,
        requests,
        hints,
        surveyQ,
        surveyR,
        config,
        announcements,
      ] = await Promise.all([
        supabase.from('tanggo_teams').select('*'),
        supabase.from('tanggo_team_members').select('*'),
        supabase.from('tanggo_quizzes').select('*'),
        supabase.from('tanggo_answers').select('*'),
        supabase.from('tanggo_mission_requests').select('*'),
        supabase.from('tanggo_hint_requests').select('*'),
        supabase.from('tanggo_survey_questions').select('*'),
        supabase.from('tanggo_survey_responses').select('*'),
        supabase.from('tanggo_event_config').select('*'),
        supabase.from('tanggo_announcements').select('*'),
      ])

      // 일부 테이블은 없을 수도 있으니 에러가 있어도 빈 배열로 둠
      const payload = {
        exported_at: new Date().toISOString(),
        app: APP_CONFIG.appName,
        teams: teams.data ?? [],
        team_members: members.data ?? [],
        quizzes: quizzes.data ?? [],
        answers: answers.data ?? [],
        mission_requests: requests.data ?? [],
        hint_requests: hints.data ?? [],
        survey_questions: surveyQ.data ?? [],
        survey_responses: surveyR.data ?? [],
        event_config: config.data ?? [],
        announcements: announcements.data ?? [],
        _errors: [
          teams.error?.message,
          members.error?.message,
          quizzes.error?.message,
          answers.error?.message,
          requests.error?.message,
          hints.error?.message,
          surveyQ.error?.message,
          surveyR.error?.message,
          config.error?.message,
          announcements.error?.message,
        ].filter(Boolean),
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${APP_CONFIG.appName}_백업_${todayStamp()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      setToast('✅ JSON 백업 파일을 다운로드했어요')
    } catch (e) {
      setToast(`백업 실패: ${e instanceof Error ? e.message : ''}`)
    } finally {
      setBusy(null)
    }
  }

  const resetEnabled = resetConfirmInput.trim() === RESET_TOKEN && busy === null

  const dangerIsEmpty = useMemo(() => {
    return (
      counts.teams === 0 &&
      counts.answers === 0 &&
      counts.missionRequests === 0 &&
      counts.surveyResponses === 0 &&
      counts.mediaFiles === 0
    )
  }, [counts])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          🗑
        </span>
        <h2 className="text-lg font-bold text-text-dark">데이터 관리</h2>
        <button
          type="button"
          onClick={fetchCounts}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-text-dark/15 text-text-dark/70 hover:bg-cream disabled:opacity-50"
        >
          {loading ? '집계 중...' : '🔄 새로고침'}
        </button>
      </div>

      {/* 현재 데이터 현황 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-3">
          📊 현재 데이터 현황
        </h3>
        {error ? (
          <p className="text-sm font-semibold text-[#E94B3C]">{error}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <StatTile label="팀" value={counts.teams} unit="팀" />
            <StatTile label="팀원" value={counts.members} unit="명" />
            <StatTile
              label="미션"
              value={counts.quizzesActive}
              unit={`/ ${counts.quizzesTotal}개 활성`}
            />
            <StatTile label="답안" value={counts.answers} unit="건" />
            <StatTile
              label="현장 미션 요청"
              value={counts.missionRequests}
              unit="건"
            />
            <StatTile label="힌트 요청" value={counts.hintRequests} unit="건" />
            <StatTile
              label="설문 응답"
              value={counts.surveyResponses}
              unit={`/ ${counts.surveyQuestions}질문`}
            />
            <StatTile label="미디어 파일" value={counts.mediaFiles} unit="개" />
          </div>
        )}
      </section>

      {/* 선택적 삭제 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-3">
          ✂ 선택적 삭제
        </h3>
        <div className="flex flex-col gap-4">
          {/* 테스트 팀 */}
          <div className="rounded-xl border border-text-dark/10 p-3">
            <p className="text-sm font-bold text-text-dark">🧪 테스트 팀 삭제</p>
            <p className="mt-1 text-xs text-text-dark/60">
              팀 이름에 다음 문자열이 포함된 팀을 모두 찾아 삭제합니다 (관련 답안 / 팀원 / 요청 / 응답 포함).
            </p>
            <div className="mt-2 flex gap-2 flex-wrap">
              <input
                type="text"
                value={testFilter}
                onChange={(e) => {
                  setTestFilter(e.target.value)
                  setPreviewLoaded(false)
                  setMatchedTeams([])
                }}
                placeholder="예: 테스트"
                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border-2 border-text-dark/10 bg-white text-sm font-medium focus:outline-none focus:border-orange-main focus:ring-2 focus:ring-orange-main/20"
              />
              <button
                type="button"
                onClick={previewMatchedTeams}
                disabled={!testFilter.trim() || busy !== null}
                className="px-3 py-2 rounded-lg text-xs font-bold border-2 border-text-dark/10 text-text-dark/70 hover:border-orange-main hover:text-orange-main bg-white disabled:opacity-50"
              >
                🔍 미리보기
              </button>
              <button
                type="button"
                onClick={deleteMatchedTeams}
                disabled={matchedTeams.length === 0 || busy !== null}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-[#E94B3C] text-white hover:bg-[#d83d2f] disabled:opacity-50"
              >
                {busy === 'test-teams'
                  ? '삭제 중...'
                  : `🗑 ${matchedTeams.length}개 팀 삭제`}
              </button>
            </div>
            {previewLoaded && (
              <div className="mt-2 text-xs">
                {matchedTeams.length === 0 ? (
                  <p className="text-text-dark/50">
                    "{testFilter}"을(를) 포함하는 팀이 없어요
                  </p>
                ) : (
                  <p className="text-text-dark/70">
                    매칭 팀:{' '}
                    <span className="font-bold text-text-dark">
                      {matchedTeams.map((t) => t.team_name).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 미디어 */}
          <div className="rounded-xl border border-text-dark/10 p-3">
            <p className="text-sm font-bold text-text-dark">
              📹 미디어 파일 일괄 삭제
            </p>
            <p className="mt-1 text-xs text-text-dark/60">
              Storage 버킷의 모든 영상/사진 파일과 mission_requests의 미디어 참조를 비웁니다. 현재 {counts.mediaFiles}개 파일.
            </p>
            <button
              type="button"
              onClick={deleteAllMedia}
              disabled={busy !== null || counts.mediaFiles === 0}
              className="mt-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#E94B3C] text-white hover:bg-[#d83d2f] disabled:opacity-50"
            >
              {busy === 'media' ? '삭제 중...' : '🗑 미디어 모두 삭제'}
            </button>
          </div>

          {/* 설문 응답 */}
          <div className="rounded-xl border border-text-dark/10 p-3">
            <p className="text-sm font-bold text-text-dark">
              📝 설문 응답 일괄 삭제
            </p>
            <p className="mt-1 text-xs text-text-dark/60">
              모든 설문 응답을 삭제합니다. 설문 질문은 유지됩니다. 현재 {counts.surveyResponses}건.
            </p>
            <button
              type="button"
              onClick={deleteAllSurveyResponses}
              disabled={busy !== null || counts.surveyResponses === 0}
              className="mt-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#E94B3C] text-white hover:bg-[#d83d2f] disabled:opacity-50"
            >
              {busy === 'survey-resp' ? '삭제 중...' : '🗑 설문 응답 모두 삭제'}
            </button>
          </div>
        </div>
      </section>

      {/* JSON 백업 */}
      <section className="rounded-2xl bg-white border border-text-dark/10 p-4">
        <h3 className="text-sm font-bold text-text-dark mb-2">💾 JSON 백업</h3>
        <p className="text-xs text-text-dark/60">
          현재 모든 데이터(팀/팀원/미션/답안/요청/설문/공지 등)를 단일 JSON 파일로 다운로드합니다. 초기화 전에 받아두면 좋아요.
        </p>
        <button
          type="button"
          onClick={downloadBackup}
          disabled={busy !== null}
          className="mt-3 px-4 py-2.5 rounded-xl text-sm font-bold bg-mint text-text-dark hover:bg-[#6FD491] disabled:opacity-50"
        >
          {busy === 'backup' ? '내려받는 중...' : '⬇ JSON 백업 다운로드'}
        </button>
      </section>

      {/* 전체 초기화 (danger zone) */}
      <section className="rounded-2xl border-4 border-[#E94B3C] bg-[#E94B3C]/5 p-4">
        <h3 className="text-sm font-black text-[#E94B3C] mb-2">
          ⚠ 전체 초기화 (Danger Zone)
        </h3>
        <p className="text-xs text-text-dark/80 leading-relaxed">
          모든 팀·팀원·답안·미션 요청·힌트 요청·설문 응답·업로드 미디어 파일을 삭제합니다. 미션 정의, 설문 질문, 행사 설정은 유지됩니다. 되돌릴 수 없습니다.
        </p>
        <div className="mt-3 flex gap-2 items-center flex-wrap">
          <label className="text-xs font-bold text-text-dark/70 shrink-0">
            "{RESET_TOKEN}" 입력:
          </label>
          <input
            type="text"
            value={resetConfirmInput}
            onChange={(e) => setResetConfirmInput(e.target.value)}
            placeholder={RESET_TOKEN}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border-2 border-[#E94B3C]/40 bg-white text-sm font-medium focus:outline-none focus:border-[#E94B3C] focus:ring-2 focus:ring-[#E94B3C]/20"
          />
          <button
            type="button"
            onClick={fullReset}
            disabled={!resetEnabled}
            className={`px-4 py-2 rounded-lg text-sm font-black ${
              resetEnabled
                ? 'bg-[#E94B3C] text-white hover:bg-[#d83d2f]'
                : 'bg-text-dark/15 text-text-dark/40 cursor-not-allowed'
            }`}
          >
            {busy === 'full-reset' ? '초기화 중...' : '🚨 전체 초기화'}
          </button>
        </div>
        {dangerIsEmpty && !loading && (
          <p className="mt-2 text-[11px] text-text-dark/50">
            현재 삭제할 데이터가 없습니다.
          </p>
        )}
      </section>

      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-text-dark text-white text-sm font-semibold shadow-lg max-w-[90vw] text-center"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  unit,
}: {
  label: string
  value: number
  unit?: string
}) {
  return (
    <div className="px-3 py-3 rounded-xl border-2 border-text-dark/10 bg-white">
      <p className="text-[11px] font-bold text-text-dark/60">{label}</p>
      <p className="mt-0.5 text-xl font-black text-text-dark tabular-nums">
        {value}
        {unit && (
          <span className="text-[11px] font-bold text-text-dark/50 ml-1">
            {unit}
          </span>
        )}
      </p>
    </div>
  )
}
