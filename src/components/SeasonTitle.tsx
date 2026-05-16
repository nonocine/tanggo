interface Props {
  className?: string
}

const SHAPE_STROKE = '#4CAF7F'
const SHAPE_SIZE = 18
const SHAPE_STROKE_WIDTH = 2.5

function Circle() {
  return (
    <svg
      width={SHAPE_SIZE}
      height={SHAPE_SIZE}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
      <circle
        cx="9"
        cy="9"
        r="6.75"
        stroke={SHAPE_STROKE}
        strokeWidth={SHAPE_STROKE_WIDTH}
      />
    </svg>
  )
}

function Square() {
  return (
    <svg
      width={SHAPE_SIZE}
      height={SHAPE_SIZE}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
      <rect
        x="2.5"
        y="2.5"
        width="13"
        height="13"
        stroke={SHAPE_STROKE}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Triangle() {
  return (
    <svg
      width={SHAPE_SIZE}
      height={SHAPE_SIZE}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
      <path
        d="M9 2.5 L16 15.5 L2 15.5 Z"
        stroke={SHAPE_STROKE}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function SeasonTitle({ className = '' }: Props) {
  return (
    <p
      className={`inline-flex items-center text-2xl font-extrabold leading-none ${className}`}
      aria-label="동래미 게임"
    >
      <span className="text-[#E94B3C]">동</span>
      <span className="text-[#F4C430]">래</span>
      <span className="text-[#4CAF7F]">미</span>
      <span className="text-text-dark/70">(</span>
      <span className="inline-flex items-center gap-1 mx-1">
        <Circle />
        <Square />
        <Triangle />
      </span>
      <span className="text-text-dark/70">)</span>
      <span className="text-text-dark ml-1.5">게임</span>
    </p>
  )
}
