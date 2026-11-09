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

const RICH_TOKEN_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|“[^”\n]+”|"[^"\n]+"|「[^」\n]+」|『[^』\n]+』|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g

/**
 * 抹掉文本里的链接（联网引用），并清理残留的空括号/分隔符。
 * 用于「不显示链接来源」时让回复干净。
 */
export function stripLinks(text: string): string {
  let t = text
  // [label](url) 与 裸链接整体删除
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '')
  t = t.replace(/https?:\/\/[^\s)]+/g, '')
  // 清理只剩分隔符的空括号（中英文）
  t = t.replace(/[（(]\s*[,，、;；·\s]*[)）]/g, '')
  // 标点前的多余空格、连续空格
  t = t.replace(/[ \t]+([，,。、；;）)])/g, '$1')
  t = t.replace(/[ \t]{2,}/g, ' ')
  // 行尾残留空格
  t = t.replace(/[ \t]+\n/g, '\n')
  return t.trim()
}

/**
 * 把消息文本里的链接美化成可点击的干净链接：
 * - `[文字](url)` → 只显示「文字」，点击打开
 * - 裸链接 → 显示「域名 ↗」，点击打开
 * 其余文本原样返回（容器保留 whitespace-pre-wrap 即可换行）。
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  // 每次调用用自己的正则实例：粗体/旁白里会递归调用，共用全局 lastIndex 会死循环
  const re = new RegExp(RICH_TOKEN_RE.source, 'g')
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] || m[3]) {
      const url = m[2] || m[3]
      const label = m[1] || `${shortUrl(m[3])} ↗`
      nodes.push(
        <a
          key={`${keyPrefix}-link-${i++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-accent/40 underline-offset-2 [overflow-wrap:anywhere]"
        >
          {label}
        </a>,
      )
    } else if (m[4]) {
      // **粗体**：去掉星号，里面的对白照样高亮
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`} className="bw-rich-strong">{renderInline(m[4], `${keyPrefix}-b${i}`)}</strong>)
    } else if (m[5]) {
      // *动作*：行内旁白
      nodes.push(<span key={`${keyPrefix}-em-${i++}`} className="bw-chat-narration chat-narration">{renderInline(m[5], `${keyPrefix}-em${i}`)}</span>)
    } else {
      // 「」『』直角引号额外带 bw-chat-quote--corner，主题可单独装饰；没写这个类的主题看起来和以前一样
      const corner = m[0][0] === '「' || m[0][0] === '『'
      nodes.push(<span key={`${keyPrefix}-quote-${i++}`} className={`bw-chat-quote chat-quote${corner ? ' bw-chat-quote--corner' : ''}`}>{m[0]}</span>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

/**
 * 除链接外，也给长回复补上稳定的“段落 / 台词 / 动作”语义。主题只负责装饰
 * 这些语义类，因此切换主题不会改写或迁移任何聊天原文。
 */
export function renderRichText(text: string): ReactNode {
  return text.split('\n').map((rawLine, index) => {
    if (!rawLine.trim()) return <span key={`space-${index}`} className="bw-rich-spacer" aria-hidden="true" />
    const trimmed = rawLine.trim()
    // Markdown 分隔线 --- / *** / ___
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return <hr key={`hr-${index}`} className="bw-rich-hr" />
    // Markdown 标题 # ~ ######：去掉井号，加粗成小标题
    const heading = /^#{1,6}\s+(.+)$/.exec(trimmed)
    if (heading) {
      return (
        <span key={`h-${index}`} className="bw-rich-line bw-rich-heading">
          {renderInline(heading[1].replace(/\s*#+$/, ''), `h-${index}`)}
        </span>
      )
    }
    const narration =
      (/^[（(].+[）)]$/.test(trimmed) || /^\*[^*].*\*$/.test(trimmed))
    const display = narration && /^\*.*\*$/.test(trimmed) ? trimmed.slice(1, -1) : rawLine
    // 整行就是一句对白时，按顾祁砚的做法排成独立的对白卡；夹在叙述里的对白仍是行内高亮。
    const quoteLine = !narration && /^(“[^”\n]+”|"[^"\n]+"|「[^」\n]+」|『[^』\n]+』)$/.test(trimmed)
    return (
      <span key={`line-${index}`} className={`bw-rich-line${narration ? ' bw-chat-narration chat-narration' : ''}${quoteLine ? ' bw-quote-line' : ''}`}>
        {renderInline(display, `line-${index}`)}
      </span>
    )
  })
}
