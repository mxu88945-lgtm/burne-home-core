/** 设置页用的简洁线条图标（stroke=currentColor，默认 20px）。 */

type P = { className?: string }
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 20,
  height: 20,
}

/** 主题 · 调色盘 */
export function PaletteIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3a9 9 0 1 0 0 18c.9 0 1.4-.8 1.4-1.5 0-.4-.2-.7-.5-1-.3-.3-.5-.6-.5-1 0-.8.7-1.5 1.6-1.5H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7" r="1" />
      <circle cx="14.5" cy="7" r="1" />
    </svg>
  )
}

/** 形象 · 外观 · 图片 */
export function ImageIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="10" r="1.5" />
      <path d="M21 16l-4.5-4.5L9 19" />
      <path d="M3 17l3.5-3.5L9 16" />
    </svg>
  )
}

/** 角色人设 · 人形 */
export function PersonIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
    </svg>
  )
}

/** 账号 · 同步 · 云 */
export function CloudIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.5 3.5 0 0 1 18 18H7z" />
    </svg>
  )
}

/** API · 模型 · 芯片 */
export function ChipIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3" />
    </svg>
  )
}

/** 语音朗读 · 喇叭 */
export function SpeakerWaveIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <polygon points="4 9 8 9 13 5 13 19 8 15 4 15" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </svg>
  )
}

/** 生成图片 · 图片 + 火花 */
export function ImageSparkIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3" y="6" width="13" height="13" rx="2" />
      <circle cx="7" cy="10" r="1.3" />
      <path d="M16 15l-3.2-3.2L8 16.5" />
      <path d="M19 3l.7 1.9 1.9.7-1.9.7L19 9l-.7-1.7-1.9-.7 1.9-.7z" />
    </svg>
  )
}

/** 读图模型 · 眼睛 */
export function EyeIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

/** 用量 · 账单 · 柱状图 */
export function ChartIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 20h18" />
      <rect x="5" y="11" width="3" height="6" rx="0.5" />
      <rect x="10.5" y="6" width="3" height="11" rx="0.5" />
      <rect x="16" y="13" width="3" height="4" rx="0.5" />
    </svg>
  )
}

/** 数据 · 备份 · 收纳盒 */
export function ArchiveIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M9.5 12h5" />
    </svg>
  )
}

/** 文件 · 文档 */
export function FileIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

/** 截图 · 取景框 */
export function CropIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M6 2v16a1 1 0 0 0 1 1h15" />
      <path d="M18 22V6a1 1 0 0 0-1-1H2" />
    </svg>
  )
}

/** 压缩 · 向内箭头 */
export function CompressIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M9 4v4H5M4 9l4-1" />
      <path d="M15 20v-4h4M20 15l-4 1" />
      <path d="M20 4l-5 5M4 20l5-5" />
    </svg>
  )
}

/** 读书 · 书本 */
export function BookIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h6v17H6a2 2 0 0 0-2 2z" />
      <path d="M20 5a2 2 0 0 0-2-2h-6v17h6a2 2 0 0 1 2 2z" />
    </svg>
  )
}

/** 隐私锁 · 锁 */
export function LockIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
