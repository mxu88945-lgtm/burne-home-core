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
