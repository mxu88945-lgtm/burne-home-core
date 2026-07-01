/**
 * LaTeX 公式渲染（KaTeX，按需懒加载，不拖慢主包）。
 *  - 行内：$...$ 或 \(...\)
 *  - 独立成块：$$...$$ 或 \[...\]
 *  - ```latex / ```math 围栏（在 dramaRich 里当作块公式处理）
 * KaTeX 只在首次遇到公式时才动态 import（含 CSS），无公式的对话零额外体积。
 * 安全：KaTeX renderToString 输出自身 sanitize 过的 HTML，仅用于展示。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** 单次加载缓存：katex 模块 + CSS */
type Katex = typeof import('katex')
let katexPromise: Promise<Katex> | null = null
function loadKatex(): Promise<Katex> {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
      ([mod]) => (('default' in mod ? mod.default : mod) as unknown) as Katex,
    )
  }
  return katexPromise
}

/** 渲染单个公式（懒加载 KaTeX；加载中/失败时降级为原始文本） */
export function Math({ tex, display }: { tex: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    loadKatex()
      .then((katex) => {
        if (!alive || !ref.current) return
        katex.render(tex, ref.current, {
          displayMode: display,
          throwOnError: false,
          output: 'html',
        })
        setReady(true)
      })
      .catch(() => {
        /* 加载失败：保留降级文本 */
      })
    return () => {
      alive = false
    }
  }, [tex, display])

  return (
    <span
      ref={ref}
      className={display ? 'my-1 block overflow-x-auto text-center' : 'inline-block align-middle'}
    >
      {!ready && (display ? `$$${tex}$$` : `$${tex}$`)}
    </span>
  )
}

/** 是否含有数学定界符（用于快速跳过无公式文本） */
export function hasMath(s: string): boolean {
  return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(s)
}

/**
 * 把一段纯文本按数学定界符拆开，公式段用 <Math> 渲染，其余原样。
 * 支持 $$...$$ / \[...\] （块），$...$ / \(...\)（行内）。
 */
export function renderMath(text: string, key: () => string): ReactNode[] {
  if (!hasMath(text)) return [text]
  // 依次匹配：块 $$...$$、块 \[...\]、行内 $...$、行内 \(...\)
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const block = m[1] ?? m[2]
    const inline = m[3] ?? m[4]
    const tex = (block ?? inline ?? '').trim()
    if (tex) out.push(<Math key={key()} tex={tex} display={block != null} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
