/**
 * 桌宠 / 小挂件：浮在所有页面上的小家伙。
 *  - 平时轻轻浮动（idle）
 *  - 可拖动到任意位置（记住位置，按 app 列百分比存）
 *  - 点一下有反应（蹦一下 + 冒爱心）
 *  - 有新消息时头顶冒个小气泡
 *  - 设置里可开关 / 换造型
 * 纯前端、只存本地，无任何网络/隐私副作用。
 */

import { useEffect, useRef, useState } from 'react'
import { usePetStore } from '@/store/petStore'
import { useDramaStore } from '@/store/dramaStore'
import { useChatStore } from '@/store/chatStore'

const BUBBLES = ['💕', '✨', '👀', '嗯？', '来啦~', '😺', '么么', '🎵', '❤️', '在呢~']
const HEARTS = ['💕', '✨', '❤️', '💗', '🌸']

function rand<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)]
}

export default function Pet() {
  const { enabled, emoji, x, y, setPos } = usePetStore()

  // 全站新消息计数（当前戏剧场景 + 当前 1v1 会话）→ 增长时冒气泡
  const dramaLen = useDramaStore((s) => s.scenes.find((sc) => sc.id === s.activeId)?.messages.length ?? 0)
  const chatLen = useChatStore((s) => s.sessions.find((c) => c.id === s.activeId)?.messages.length ?? 0)
  const total = dramaLen + chatLen

  const ref = useRef<HTMLDivElement>(null)
  const [pos, setLocalPos] = useState({ x, y })
  const [hop, setHop] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [hearts, setHearts] = useState<{ id: number; e: string; dx: number }[]>([])

  // 拖动状态（用 ref 避免频繁 re-render）
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0 })
  const dragging = useRef(false)
  const prevTotal = useRef<number | null>(null)
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // store 位置变化时（换设备/重置）同步到本地，拖动中不打断
  useEffect(() => {
    if (!dragging.current) setLocalPos({ x, y })
  }, [x, y])

  // 新消息 → 冒气泡
  useEffect(() => {
    if (prevTotal.current === null) {
      prevTotal.current = total
      return
    }
    if (total > prevTotal.current) popBubble(rand(BUBBLES))
    prevTotal.current = total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  function popBubble(text: string) {
    setBubble(text)
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(null), 2600)
  }

  function react() {
    setHop(false)
    requestAnimationFrame(() => setHop(true))
    setTimeout(() => setHop(false), 620)
    // 冒几颗爱心
    const burst = Array.from({ length: 3 }, (_, i) => ({
      id: Date.now() + i,
      e: rand(HEARTS),
      dx: (i - 1) * 16 + (Math.random() * 8 - 4),
    }))
    setHearts((h) => [...h, ...burst])
    setTimeout(() => setHearts((h) => h.filter((p) => !burst.some((b) => b.id === p.id))), 950)
    popBubble(rand(BUBBLES))
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return
    const dist = Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy)
    if (dist > 6) {
      drag.current.moved = true
      dragging.current = true
    }
    if (!drag.current.moved) return
    const parent = ref.current?.offsetParent as HTMLElement | null
    const r = parent?.getBoundingClientRect()
    if (!r) return
    const nx = Math.max(0.04, Math.min(0.96, (e.clientX - r.left) / r.width))
    const ny = Math.max(0.06, Math.min(0.94, (e.clientY - r.top) / r.height))
    setLocalPos({ x: nx, y: ny })
  }
  function onPointerUp() {
    if (!drag.current.active) return
    const moved = drag.current.moved
    drag.current.active = false
    if (moved) {
      setPos(pos.x, pos.y)
      // 稍后再解除 dragging，避免 store 回写触发跳动
      setTimeout(() => (dragging.current = false), 0)
    } else {
      react()
    }
  }

  if (!enabled) return null

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-40 select-none"
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: 'translate(-50%, -50%)' }}
    >
      {/* 气泡 */}
      {bubble && (
        <div
          className="pet-bubble glass absolute -top-7 left-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] text-ink shadow-sm"
          style={{ transform: 'translateX(-50%)' }}
        >
          {bubble}
        </div>
      )}
      {/* 爱心 */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="pet-heart pointer-events-none absolute -top-1 left-1/2 text-[15px]"
          style={{ marginLeft: h.dx }}
        >
          {h.e}
        </span>
      ))}
      {/* 本体 */}
      <button
        type="button"
        aria-label="小挂件"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="pointer-events-auto grid h-11 w-11 cursor-grab touch-none place-items-center rounded-full bg-white/45 text-2xl shadow-md backdrop-blur active:cursor-grabbing"
      >
        <span className={hop ? 'pet-hop inline-block' : 'pet-idle inline-block'}>{emoji}</span>
      </button>
    </div>
  )
}
