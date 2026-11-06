export interface StandaloneViewportInput {
  fullHeight: number
  visualHeight?: number
  offsetTop?: number
  lastKeyboardInset?: number
}

export interface StandaloneViewportResult {
  appHeight: number
  keyboardInset: number
  keyboardOpen: boolean
  readingSane: boolean
}

/**
 * iOS 装机版偶尔会在流式回复/输入法切换后报告一个只有一百多像素高的
 * visualViewport。那不是实际键盘边界，不能拿它去压缩整座 App 壳。
 *
 * App 始终保留物理屏幕高；键盘只形成底部 inset。异常读数优先沿用上一次
 * 可信 inset，没有历史值时回落到常见的 42% 键盘高度。
 */
export function resolveStandaloneViewport({
  fullHeight,
  visualHeight,
  offsetTop = 0,
  lastKeyboardInset = 0,
}: StandaloneViewportInput): StandaloneViewportResult {
  const height = Number.isFinite(visualHeight) ? Math.max(0, visualHeight!) : fullHeight
  const visibleBottom = height + Math.max(0, offsetTop)
  const rawInset = Math.max(0, fullHeight - visibleBottom)
  const keyboardOpen = rawInset > 120
  const minSaneVisible = Math.max(280, fullHeight * 0.42)
  const readingSane = !keyboardOpen || visibleBottom >= minSaneVisible

  let keyboardInset = 0
  if (keyboardOpen) {
    if (readingSane) keyboardInset = rawInset
    else if (lastKeyboardInset > 120) keyboardInset = lastKeyboardInset
    else keyboardInset = Math.round(fullHeight * 0.42)
  }

  keyboardInset = Math.min(keyboardInset, Math.round(fullHeight * 0.58))
  return { appHeight: fullHeight, keyboardInset, keyboardOpen, readingSane }
}
