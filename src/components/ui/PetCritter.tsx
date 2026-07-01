/**
 * Claude 风格的手绘小桌宠：圆滚滚的黏土橘小生物，有小短腿。
 * walking=true 时身体轻晃、四条腿摆动，像在爬/走。
 * 纯 SVG，无外部资源。
 */
export default function PetCritter({ walking, className = '' }: { walking?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={`pet-critter ${walking ? 'walk' : ''} ${className}`} aria-hidden>
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
