/**
 * 手绘小桌宠（纯 SVG，无外部资源）。三种形状：
 *  - claude：Claude 风格黏土橘小生物，四条小短腿
 *  - octo  ：八爪鱼，触手会摆动
 *  - bird  ：圆滚滚小鸟，翅膀会扇、两条小腿
 * walking=true 时对应部件摆动，像在爬/走。
 */

export type PetVariant = 'claude' | 'octo' | 'bird'

export default function PetCritter({
  variant = 'claude',
  walking,
  className = '',
}: {
  variant?: PetVariant
  walking?: boolean
  className?: string
}) {
  const cls = `pet-critter ${walking ? 'walk' : ''} ${className}`

  if (variant === 'octo') {
    return (
      <svg viewBox="0 0 64 56" className={cls} aria-hidden>
        {/* 触手（交替摆动） */}
        <g>
          <rect className="pet-leg leg-a" x="14" y="34" width="6" height="16" rx="3" fill="#B06FC4" />
          <rect className="pet-leg leg-b" x="22" y="36" width="6" height="16" rx="3" fill="#C58BD9" />
          <rect className="pet-leg leg-a" x="30" y="37" width="6" height="16" rx="3" fill="#B06FC4" />
          <rect className="pet-leg leg-b" x="38" y="36" width="6" height="16" rx="3" fill="#C58BD9" />
          <rect className="pet-leg leg-a" x="46" y="34" width="6" height="16" rx="3" fill="#B06FC4" />
        </g>
        {/* 头身 */}
        <path d="M11 30 a21 20 0 0 1 42 0 v6 H11 z" fill="#C58BD9" />
        <ellipse cx="32" cy="30" rx="14" ry="9" fill="#DcAEEA" opacity="0.5" />
        {/* 眼睛 */}
        <circle cx="25" cy="24" r="3.4" fill="#3A2A3A" />
        <circle cx="39" cy="24" r="3.4" fill="#3A2A3A" />
        <circle cx="26.1" cy="22.8" r="1.1" fill="#fff" />
        <circle cx="40.1" cy="22.8" r="1.1" fill="#fff" />
        {/* 腮红 + 嘴 */}
        <ellipse cx="19.5" cy="29" rx="3" ry="2" fill="#E85C8A" opacity="0.4" />
        <ellipse cx="44.5" cy="29" rx="3" ry="2" fill="#E85C8A" opacity="0.4" />
        <path d="M29 29 q3 2.4 6 0" stroke="#3A2A3A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    )
  }

  if (variant === 'bird') {
    return (
      <svg viewBox="0 0 64 56" className={cls} aria-hidden>
        {/* 两条小腿 */}
        <g>
          <rect className="pet-leg leg-a" x="26" y="42" width="4" height="10" rx="2" fill="#E0913A" />
          <rect className="pet-leg leg-b" x="34" y="42" width="4" height="10" rx="2" fill="#E0913A" />
        </g>
        {/* 身体 */}
        <ellipse cx="32" cy="28" rx="20" ry="18" fill="#F5D06A" />
        <ellipse cx="32" cy="33" rx="12" ry="9" fill="#FBE49B" opacity="0.6" />
        {/* 翅膀（扇动） */}
        <path className="pet-leg leg-a" d="M14 27 q-8 3 -1 9 q4 -3 6 -6 z" fill="#EBC24E" />
        <path className="pet-leg leg-b" d="M50 27 q8 3 1 9 q-4 -3 -6 -6 z" fill="#EBC24E" />
        {/* 头顶呆毛 */}
        <path d="M32 10 q2 4 -1 7 M32 10 q-2 4 1 7" stroke="#EBC24E" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* 眼睛 */}
        <circle cx="26" cy="26" r="3.2" fill="#3A2E1A" />
        <circle cx="38" cy="26" r="3.2" fill="#3A2E1A" />
        <circle cx="27" cy="24.9" r="1" fill="#fff" />
        <circle cx="39" cy="24.9" r="1" fill="#fff" />
        {/* 嘴（橙色小三角） */}
        <path d="M30 31 l4 0 l-2 3 z" fill="#E8801F" />
        {/* 腮红 */}
        <ellipse cx="21" cy="31" rx="3" ry="2" fill="#E85C7A" opacity="0.35" />
        <ellipse cx="43" cy="31" rx="3" ry="2" fill="#E85C7A" opacity="0.35" />
      </svg>
    )
  }

  // claude（默认）
  return (
    <svg viewBox="0 0 64 56" className={cls} aria-hidden>
      {/* 四条小短腿（前后交替摆动） */}
      <g>
        <rect className="pet-leg leg-a" x="18" y="36" width="5.5" height="13" rx="2.75" fill="#B85C3C" />
        <rect className="pet-leg leg-b" x="27" y="38" width="5.5" height="13" rx="2.75" fill="#A64F32" />
        <rect className="pet-leg leg-a" x="34" y="38" width="5.5" height="13" rx="2.75" fill="#A64F32" />
        <rect className="pet-leg leg-b" x="41" y="36" width="5.5" height="13" rx="2.75" fill="#B85C3C" />
      </g>
      {/* 身体 */}
      <ellipse cx="32" cy="27" rx="23" ry="19" fill="#D97757" />
      <ellipse cx="32" cy="32" rx="15" ry="11" fill="#E8967A" opacity="0.55" />
      {/* 小尾巴 */}
      <path d="M53 30 q9 2 8 -6 q-3 5 -8 1 z" fill="#C15F3C" />
      {/* 眼睛 */}
      <circle cx="25" cy="25" r="3.4" fill="#3A2A24" />
      <circle cx="39" cy="25" r="3.4" fill="#3A2A24" />
      <circle cx="26.1" cy="23.8" r="1.1" fill="#fff" />
      <circle cx="40.1" cy="23.8" r="1.1" fill="#fff" />
      {/* 腮红 */}
      <ellipse cx="19.5" cy="31" rx="3.2" ry="2.1" fill="#E85C7A" opacity="0.35" />
      <ellipse cx="44.5" cy="31" rx="3.2" ry="2.1" fill="#E85C7A" opacity="0.35" />
      {/* 嘴 */}
      <path d="M29 31 q3 2.6 6 0" stroke="#3A2A24" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}
