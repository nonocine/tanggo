import MissionApprovalQueue from '../../../components/MissionApprovalQueue'

export default function MissionApproval() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl" aria-hidden>
          ✋
        </span>
        <h2 className="text-lg font-bold text-text-dark">미션 승인</h2>
      </div>
      <MissionApprovalQueue actorLabel="관리자" />
    </div>
  )
}
