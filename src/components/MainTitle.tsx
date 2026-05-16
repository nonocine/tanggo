type Size = 'lg' | 'md' | 'sm'

interface Props {
  size?: Size
  className?: string
}

const SIZE_CLASS: Record<Size, string> = {
  lg: 'text-5xl',
  md: 'text-4xl',
  sm: 'text-3xl',
}

export default function MainTitle({ size = 'md', className = '' }: Props) {
  return (
    <h1
      className={`font-black tracking-tight leading-none ${SIZE_CLASS[size]} ${className}`}
    >
      <span className="text-orange-main">해결해</span>
      <span className="text-mint">On</span>
      <span className="text-orange-main">나</span>
    </h1>
  )
}
