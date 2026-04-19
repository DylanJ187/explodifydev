interface Props {
  size?: number
  className?: string
}

export function CubeLogo({ size = 28, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16 7 L24.5 11.5 L24.5 20.5 L16 25 L7.5 20.5 L7.5 11.5 Z" />
      <path d="M16 16 L16 25 M7.5 11.5 L16 16 M24.5 11.5 L16 16" />
    </svg>
  )
}

export default CubeLogo
