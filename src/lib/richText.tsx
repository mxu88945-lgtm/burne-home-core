import type { ReactNode } from 'react'

/** 取链接的简洁显示名：去掉协议和 www，只留域名 */
function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// 匹配 Markdown 链接 [label](url) 或 裸 http(s) 链接
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g

/**
 * 把消息文本里的链接美化成可点击的干净链接：
 * - `[文字](url)` → 只显示「文字」，点击打开
 * - 裸链接 → 显示「域名 ↗」，点击打开
 * 其余文本原样返回（容器保留 whitespace-pre-wrap 即可换行）。
 */
export function renderRichText(text: string): ReactNode {
  const nodes: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const mdLabel = m[1]
    const mdUrl = m[2]
    const bareUrl = m[3]
    const url = mdUrl || bareUrl
    const label = mdLabel || `${shortUrl(bareUrl)} ↗`
    nodes.push(
      <a
        key={i++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-accent/40 underline-offset-2 [overflow-wrap:anywhere]"
      >
        {label}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : text
}
