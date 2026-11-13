import { useEffect, useRef } from 'react'

/**
 * 计算让 el 在滚动容器里居中所需的 scrollTop（夹在 [0, 最大可滚] 之间）。
 * 纯函数，方便测试；elTop/elHeight 是元素相对容器内容顶部的位置。
 */
export function centeredScrollTop({
  elTop,
  elHeight,
  viewHeight,
  scrollHeight,
}: {
  elTop: number
  elHeight: number
  viewHeight: number
  scrollHeight: number
}): number {
  const max = Math.max(0, scrollHeight - viewHeight)
  const target = elTop + elHeight / 2 - viewHeight / 2
  return Math.round(Math.min(max, Math.max(0, target)))
}

function isTextField(el: Element | null): el is HTMLElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color'].includes(el.type)
  }
  return (el as HTMLElement).isContentEditable === true
}

/**
 * 底部面板的键盘适配（iOS Safari / 装机版）：
 * - 面板外层用 `top: var(--app-offset)` + `height: var(--app-height)`（main.tsx 按
 *   visualViewport 算好的可见区，和 App 外壳/主聊输入栏同一套），键盘弹出时整块收到键盘上沿；
 * - 本 hook 管面板内部：聚焦文本框后等键盘动画（~300ms）把它滚到面板可视区中间，
 *   键盘高度再变（换输入法/工具条）时跟着重算。只滚面板自己，不碰外层容器
 *   （外层被 iOS 滚歪由 main.tsx 的 resetContainerScroll 复位）。
 */
export function useKeyboardAwareSheet<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const scroller = ref.current
    if (!scroller) return
    const timers: number[] = []

    const center = () => {
      const el = document.activeElement
      if (!isTextField(el) || !scroller.contains(el)) return
      const s = scroller.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      scroller.scrollTop = centeredScrollTop({
        elTop: r.top - s.top + scroller.scrollTop,
        elHeight: r.height,
        viewHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
      })
    }
    const schedule = () => {
      for (const ms of [120, 320, 600]) timers.push(window.setTimeout(center, ms))
    }
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target as Element)) schedule()
    }

    scroller.addEventListener('focusin', onFocusIn)
    const vv = window.visualViewport
    vv?.addEventListener('resize', center)
    return () => {
      scroller.removeEventListener('focusin', onFocusIn)
      vv?.removeEventListener('resize', center)
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  return ref
}
