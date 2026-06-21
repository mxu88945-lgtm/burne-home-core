/** 聊天操作条用的线条图标（stroke=currentColor，随文字色；统一 16px、视觉大小一致） */

type P = { className?: string }
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 16,
  height: 16,
}

export function CopyIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
    </svg>
  )
}

export function RegenIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <polyline points="20.5 3.5 20.5 9 15 9" />
    </svg>
  )
}

export function EditIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17z" />
      <path d="M14.5 7.5l3 3" />
    </svg>
  )
}

export function SpeakerIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <polygon points="3 9 7 9 12 4 12 20 7 15 3 15" />
      <path d="M16 8.5a6 6 0 0 1 0 7" />
    </svg>
  )
}

export function StopIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
    </svg>
  )
}
