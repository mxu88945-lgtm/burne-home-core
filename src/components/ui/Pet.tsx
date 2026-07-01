/**
 * 桌宠 / 小挂件：浮在所有页面上的小家伙。
 *  - 会自己在屏幕上慢慢爬来爬去（Claude 风格手绘小生物走路时腿会动）
 *  - 可拖动到任意位置（记住位置，按 app 列百分比存）
 *  - 点一下有反应（蹦一下 + 冒爱心）
 *  - 有新消息时头顶冒个小气泡
 *  - 设置里可开关 / 换造型
 * 纯前端、只存本地，无任何网络/隐私副作用。
 */

import { useEffect, useRef, useState } from 'react'
import { usePetStore, PET_CLAUDE } from '@/store/petStore'
import { useDramaStore } from '@/store/dramaStore'
import { useChatStore } from '@/store/chatStore'
import PetCritter from '@/components/ui/PetCritter'

const BUBBLES = ['💕', '✨', '👀', '嗯？', '来啦~', '😺', '么么', '🎵', '❤️', '在呢~']
const HEARTS = ['💕', '✨', '❤️', '💗', '🌸']

function rand<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)]
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export default function Pet() {
  const { enabled, emoji, x, y, setPos } = usePetStore()

  // 全站新消息计数（当前戏剧场景 + 当前 1v1 会话）→ 增长时冒气泡
  const dramaLen = useDramaStore((s) => s.scenes.find((sc) => sc.id === s.activeId)?.messages.length ?? 0)
  const chatLen = useChatStore((s) => s.sessions.find((c) => c.id === s.activeId)?.messages.length ?? 0)
  const total = dramaLen + chatLen

  const ref = useRef<HTMLDivElement>(null)
  const [pos, setLocalPos] = useState({ x, y })
  const posRef = useRef({ x, y })
  const [hop, setHop] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [hearts, setHearts] = useState<{ id: number; e: string; dx: number }[]>([])
  // 走动状态
  const [walking, setWalking] = useState(false)
  const [facing, setFacing] = useState(1) // 1 朝右，-1 朝左
  const [moveDur, setMoveDur] = useState(0) // 秒；>0 时给 left/top 加过渡

  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0 })
  const dragging = useRef(false)
  const prevTotal = useRef<number | null>(null)
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = (nx: number, ny: number) => {
    posRef.current = { x: nx, y: ny }
    setLocalPos({ x: nx, y: ny })
  }

  // store 位置变化时（换设备/重置）同步到本地，拖动/走动中不打断
  useEffect(() => {
    if (!dragging.current) commit(x, y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 自己溜达：每隔一会儿爬去一个随机位置
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    let stopWalk: ReturnType<typeof setTimeout>
    const wander = () => {
      timer = setTimeout(() => {
        if (!alive) return
        if (!dragging.current) {
          const nx = clamp(0.08 + Math.random() * 0.84, 0.04, 0.96)
          // 纵向别溜进底部输入栏区域（避免挡住发送键）
          const ny = clamp(0.14 + Math.random() * 0.62, 0.06, 0.8)
          const dist = Math.hypot(nx - posRef.current.x, ny - posRef.current.y)
          setFacing(nx >= posRef.current.x ? 1 : -1)
          const dur = clamp(dist * 7, 1.4, 6) // 距离越远走越久
          setMoveDur(dur)
          setWalking(true)
          commit(nx, ny)
          setPos(nx, ny)
          stopWalk = setTimeout(() => alive && setWalking(false), dur * 1000)
        }
        wander()
      }, 5000 + Math.random() * 7000)
    }
    wander()
    return () => {
      alive = false
      clearTimeout(timer)
      clearTimeout(stopWalk)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  function popBubble(text: string) {
    setBubble(text)
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(null), 2600)
  }

  function react() {
    setHop(false)
    requestAnimationFrame(() => setHop(true))
    setTimeout(() => setHop(false), 620)
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
    setMoveDur(0) // 拖动时取消过渡，跟手
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return
    const d = Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy)
    if (d > 6) {
      drag.current.moved = true
      dragging.current = true
      setWalking(false)
    }
    if (!drag.current.moved) return
    const parent = ref.current?.offsetParent as HTMLElement | null
    const r = parent?.getBoundingClientRect()
    if (!r) return
    const nx = clamp((e.clientX - r.left) / r.width, 0.04, 0.96)
    const ny = clamp((e.clientY - r.top) / r.height, 0.06, 0.94)
    commit(nx, ny)
  }
  function onPointerUp() {
    if (!drag.current.active) return
    const moved = drag.current.moved
    drag.current.active = false
    if (moved) {
      setPos(posRef.current.x, posRef.current.y)
      setTimeout(() => (dragging.current = false), 0)
    } else {
      react()
    }
  }

  if (!enabled) return null

  const isClaude = emoji === PET_CLAUDE

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-40 select-none"
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        transition: moveDur ? `left ${moveDur}s linear, top ${moveDur}s linear` : undefined,
      }}
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
        <span key={h.id} className="pet-heart pointer-events-none absolute -top-1 left-1/2 text-[15px]" style={{ marginLeft: h.dx }}>
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
        className="pointer-events-auto grid h-12 w-12 cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing"
        style={{ transform: `scaleX(${facing})` }}
      >
        {isClaude ? (
          <PetCritter walking={walking} className={`h-11 w-11 ${hop ? 'pet-hop' : 'pet-idle'}`} />
        ) : (
          <span className={`text-2xl ${hop ? 'pet-hop' : 'pet-idle'} inline-block`}>{emoji}</span>
        )}
      </button>
    </div>
  )
}
