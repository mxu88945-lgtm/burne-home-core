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

export interface StandaloneFrameResult extends StandaloneViewportResult {
  frameHeight: number
  frameOffset: number
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
  offsetTop: _offsetTop = 0,
  lastKeyboardInset = 0,
}: StandaloneViewportInput): StandaloneViewportResult {
  const height = Number.isFinite(visualHeight) ? Math.max(0, visualHeight!) : fullHeight
  // `offsetTop` is a *pan inside the layout viewport*, not extra visible
  // height.  Recent iOS standalone builds commonly report values such as
  // height=520 + offsetTop=374 on a 956px screen.  Adding them makes the
  // keyboard look like a harmless 62px status-bar gap, so the app keeps its
  // full 956px shell and every composer ends up under the keyboard toolbar.
  // Detect the keyboard from the shrunken visual height alone.
  const rawInset = Math.max(0, fullHeight - height)
  const keyboardOpen = rawInset > 120
  const minSaneVisible = Math.max(280, fullHeight * 0.42)
  const readingSane = !keyboardOpen || height >= minSaneVisible

  let keyboardInset = 0
  if (keyboardOpen) {
    if (readingSane) keyboardInset = rawInset
    else if (lastKeyboardInset > 120) keyboardInset = lastKeyboardInset
    else keyboardInset = Math.round(fullHeight * 0.42)
  }

  keyboardInset = Math.min(keyboardInset, Math.round(fullHeight * 0.58))
  return { appHeight: fullHeight, keyboardInset, keyboardOpen, readingSane }
}

/**
 * Translate WebKit's keyboard reading into the actual App shell frame.
 *
 * On the affected iPhone PWA, visualViewport.height already ends at the
 * keyboard toolbar while offsetTop reports the same page pan separately.
 * Keep the fixed shell at zero and use only the shrunken visual height:
 * applying offsetTop again double-counts the pan and puts the composer under
 * the keyboard accessory bar. We also deliberately avoid transforms because
 * transformed fixed elements are unstable during iOS keyboard interaction.
 */
export function resolveStandaloneFrame(input: StandaloneViewportInput): StandaloneFrameResult {
  const geometry = resolveStandaloneViewport(input)
  const visualHeight = Number.isFinite(input.visualHeight)
    ? Math.max(0, input.visualHeight!)
    : geometry.appHeight
  const frameHeight = geometry.keyboardOpen
    ? geometry.readingSane
      ? visualHeight
      : geometry.appHeight - geometry.keyboardInset
    : geometry.appHeight

  return { ...geometry, frameHeight, frameOffset: 0 }
}
