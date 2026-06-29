/** 聊天操作条用的线条图标（stroke=currentColor，随文字色；统一 16px、视觉大小一致） */

type P = { className?: string }
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 13,
  height: 13,
}

/* 以下操作图标统一画在约 x5–19 / y5–19 的居中范围，三个视觉大小一致 */

export function CopyIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M6 15a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2" />
    </svg>
  )
}

export function RegenIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M19 12a7 7 0 1 1-2-5" />
      <polyline points="19 5 19 9.5 14.5 9.5" />
    </svg>
  )
}

export function EditIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M5 19h3L18 9a1.8 1.8 0 0 0-2.6-2.6L5 16z" />
      <path d="M13.8 8l2.6 2.6" />
    </svg>
  )
}

export function SpeakerIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" />
      <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
    </svg>
  )
}

export function StopIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

/** 发送 · 纸飞机 */
export function SendIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  )
}

/** 发送 · 上箭头（黑圆底用，像 Claude） */
export function ArrowUpIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  )
}

/** 麦克风 */
export function MicIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  )
}

/** 电话听筒 */
export function PhoneIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
    </svg>
  )
}
