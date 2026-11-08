// 大图双指放大 / 单指拖动 / 双击放大还原。放大时锁住左右翻页，缩回 1 倍再恢复。
export function attachPinchZoom(img: HTMLElement, track: HTMLElement | null): () => void {
  let s = 1
  let x = 0
  let y = 0
  let pinch: { d: number; s: number; x: number; y: number } | null = null
  let pan: { px: number; py: number; x: number; y: number } | null = null
  let lastTap = 0

  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const clampPan = () => {
    const w = img.offsetWidth
    const h = img.offsetHeight
    const mx = Math.max(0, (w * s - w) / 2)
    const my = Math.max(0, (h * s - h) / 2)
    x = Math.max(-mx, Math.min(mx, x))
    y = Math.max(-my, Math.min(my, y))
  }
  const apply = (animate = false) => {
    img.style.transition = animate ? 'transform .22s ease' : 'none'
    if (s <= 1.01) {
      s = 1
      x = 0
      y = 0
      img.style.transform = ''
      if (track) track.style.overflowX = ''
    } else {
      img.style.transform = `translate(${x}px, ${y}px) scale(${s})`
      if (track) track.style.overflowX = 'hidden'
    }
  }

  const onStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinch = { d: dist(e.touches) || 1, s, x, y }
      pan = null
    } else if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTap < 280) {
        // 双击：放大 2.5 倍 / 还原
        e.preventDefault()
        s = s > 1.01 ? 1 : 2.5
        x = 0
        y = 0
        apply(true)
        lastTap = 0
        return
      }
      lastTap = now
      if (s > 1.01) pan = { px: e.touches[0].clientX, py: e.touches[0].clientY, x, y }
    }
  }
  const onMove = (e: TouchEvent) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault()
      const ns = Math.max(1, Math.min(5, (pinch.s * dist(e.touches)) / pinch.d))
      const k = ns / pinch.s
      x = pinch.x * k
      y = pinch.y * k
      s = ns
      clampPan()
      apply()
    } else if (pan && e.touches.length === 1 && s > 1.01) {
      e.preventDefault()
      x = pan.x + (e.touches[0].clientX - pan.px)
      y = pan.y + (e.touches[0].clientY - pan.py)
      clampPan()
      apply()
    }
  }
  const onEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) pinch = null
    if (e.touches.length === 0) {
      pan = null
      if (s < 1.05) apply(true)
    }
  }
  const stopGesture = (e: Event) => e.preventDefault()

  img.addEventListener('touchstart', onStart, { passive: false })
  img.addEventListener('touchmove', onMove, { passive: false })
  img.addEventListener('touchend', onEnd)
  img.addEventListener('touchcancel', onEnd)
  img.addEventListener('gesturestart', stopGesture)
  return () => {
    img.removeEventListener('touchstart', onStart)
    img.removeEventListener('touchmove', onMove)
    img.removeEventListener('touchend', onEnd)
    img.removeEventListener('touchcancel', onEnd)
    img.removeEventListener('gesturestart', stopGesture)
    if (track) track.style.overflowX = ''
  }
}
