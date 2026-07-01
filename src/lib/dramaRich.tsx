/**
 * 戏剧消息「美化」渲染：
 *  - <audio>/<source src> → 真·音乐播放器
 *  - ```…``` 代码块、连续的状态栏行（⏰时间/🗺地点/📌事件…）→ 可点开/关闭的灰色面板
 *  - 清掉裸标签 <em>/<plot>/<br> 等，只留内容
 * 安全：不用 dangerouslySetInnerHTML，只取 audio 的 src 当播放源。
 * 注意：key 用确定性序号（同一段文本每次渲染序号一致），保证折叠状态不会因重渲染丢失。
 */

import { useState, type ReactNode } from 'react'
import { HtmlCard, isRichHtml } from '@/lib/htmlCard'
import { Math, renderMath } from '@/lib/mathRender'
import { applyMacros } from '@/lib/macros'
import { SafeHtml, hasInlineHtml, isFullHtmlDoc } from '@/lib/safeHtml'

/** 状态栏行的起始标记（emoji） */
const STATUS_RE = /^\s*(⏰|⏱|🕐|🕒|🕛|🍊|🏠|🏡|🗺️?|📍|📌|📅|🎬|🎭|💬|❤️|🩷)/

function srcOf(tag: string): string {
  const m = tag.match(/src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : ''
}

/** 去掉裸标签（保留内里文字），<br> 变换行 */
function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<\/?(em|i|b|strong|u|p|plot|details|summary|span|mark|div)\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function AudioPlayer({ src }: { src: string }) {
  if (!src) return null
  return <audio controls src={src} preload="none" className="my-1.5 h-9 w-full max-w-[280px]" />
}

/** 可折叠灰面板（状态栏 / 心声） */
function Panel({ label, body }: { label: string; body: string }) {
  const [open, setOpen] = useState(true)
  if (!body.trim()) return null
  return (
    <div className="my-1.5 overflow-hidden rounded-xl bg-black/[0.06]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[12px] text-muted"
      >
        <span>{label}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="whitespace-pre-wrap px-3 pb-2 text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">
          {body}
        </div>
      )}
    </div>
  )
}

function panelLabel(body: string): string {
  if (/好感|爱意|情绪|HP|属性|性欲|数值/.test(body)) return '状态栏'
  if (/时间|地点|⏰|🗺️?/.test(body)) return '时间 · 地点'
  if (/状态|事件/.test(body)) return '状态栏'
  return '心声'
}

/**
 * 内联美化（角色扮演通用写法，无需正则）：
 *  **粗体** / `心理独白`（灰字）/ *动作*（正常文段，只去掉星号）/ “对话”「对话」(主题色) / LaTeX 公式
 *  —— 动作描写按普通正式文段显示，不加斜体/颜色，避免整段歪斜难读。
 */
function renderEmphasis(s: string, key: () => string): ReactNode[] {
  const re = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`|\*([^*\n]+?)\*|[“"]([^”"\n]+?)[”"]|「([^」\n]+?)」/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    if (m[1] != null) out.push(<strong key={key()}>{m[1]}</strong>)
    else if (m[2] != null) out.push(<span key={key()} className="italic text-muted">{m[2]}</span>)
    else if (m[3] != null) out.push(m[3]) // 动作：正常文段，仅去掉 * 号
    else if (m[4] != null) out.push(<span key={key()} className="text-accent">“{m[4]}”</span>)
    else if (m[5] != null) out.push(<span key={key()} className="text-accent">「{m[5]}」</span>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

/** 一段普通文字 → 先解析公式，再对纯文本片段做内联美化 */
function renderInline(text: string, key: () => string): ReactNode[] {
  const out: ReactNode[] = []
  for (const p of renderMath(text, key)) {
    if (typeof p === 'string') out.push(...renderEmphasis(p, key))
    else out.push(p)
  }
  return out
}

/** 普通文本：把连续的状态栏行收进折叠面板，其余按段落显示 */
function renderPlain(text: string, key: () => string): ReactNode[] {
  const t = stripTags(text)
  if (!t.trim()) return []
  const out: ReactNode[] = []
  let buf: string[] = []
  let stat: string[] = []
  const flushBuf = () => {
    // 段落之间的空行不再原样保留成整行空白，改成拆段、由容器给固定小间距（行距更紧凑）
    for (const para of buf.join('\n').split(/\n{2,}/)) {
      const p = para.trim()
      if (p)
        out.push(
          <div key={key()} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {renderInline(p, key)}
          </div>,
        )
    }
    buf = []
  }
  const flushStat = () => {
    if (stat.length) out.push(<Panel key={key()} label="状态栏" body={stat.join('\n')} />)
    stat = []
  }
  for (const ln of t.split('\n')) {
    if (STATUS_RE.test(ln)) {
      flushBuf()
      stat.push(ln)
    } else {
      flushStat()
      buf.push(ln)
    }
  }
  flushBuf()
  flushStat()
  return out
}

/** 整条消息就是一个 ```html``` 代码围栏包着的 HTML → 剥掉围栏，取里面的 HTML */
function unwrapHtmlFence(s: string): string {
  const m = s.trim().match(/^```(?:html|xml|markdown|md)?\s*\n([\s\S]*?)\n?```$/i)
  return m && isRichHtml(m[1]) ? m[1] : s
}

/** 解析一段消息文本 → 美化后的 React 节点 */
export function DramaRich({ text: raw, user, char }: { text: string; user?: string; char?: string }) {
  // 先把 {{user}}/{{char}} 换成真实名字（卡里常用，尤其开场白 HTML）
  const text = applyMacros(unwrapHtmlFence(raw), { user, char })
  const fenced = text.includes('```')
  // 整段 HTML 文档（带 <style>/<html>/<script> 的开场白/播放器）→ 沙箱 iframe 真渲染
  if (!fenced && isFullHtmlDoc(text)) return <HtmlCard html={text} />
  // 带样式的内联/块级 HTML（正则美化产出：对话上色、心理灰底、<details> 状态栏）
  // → 消毒后就地渲染，继承主题配色、自然随文流动
  if (!fenced && !/<audio\b/i.test(text) && hasInlineHtml(text)) return <SafeHtml html={text} />

  let n = 0
  const key = () => `r${n++}` // 确定性序号：同文本每次一致，折叠状态稳定
  const nodes: ReactNode[] = []

  // 1) 先把 <audio>…</audio> / <audio …/> 抠出来
  const audioRe = /<audio\b[\s\S]*?(?:<\/audio>|\/>)/gi
  const segs: { type: 'text' | 'audio'; val: string }[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = audioRe.exec(text))) {
    if (m.index > last) segs.push({ type: 'text', val: text.slice(last, m.index) })
    segs.push({ type: 'audio', val: srcOf(m[0]) })
    last = m.index + m[0].length
  }
  if (last < text.length) segs.push({ type: 'text', val: text.slice(last) })
  if (!segs.length) segs.push({ type: 'text', val: text })

  for (const seg of segs) {
    if (seg.type === 'audio') {
      nodes.push(<AudioPlayer key={key()} src={seg.val} />)
      continue
    }
    // 2) 按 ``` 围栏拆：奇数段=围栏内容→面板；偶数段=普通文本
    const parts = seg.val.split(/```/)
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        // ```latex / ```math 围栏 → 块公式
        const mFence = part.match(/^(latex|math|tex)\s*\n([\s\S]*)$/i)
        if (mFence) {
          const tex = mFence[2].trim()
          if (tex) nodes.push(<Math key={key()} tex={tex} display />)
          return
        }
        // ```html 围栏（或围栏内就是整页 HTML）→ 沙箱 iframe 真渲染
        const inner = part.replace(/^(html|xml|markdown|md)\s*\n/i, '')
        if (isRichHtml(inner)) {
          nodes.push(<HtmlCard key={key()} html={inner} />)
          return
        }
        const body = stripTags(part)
        nodes.push(<Panel key={key()} label={panelLabel(body)} body={body} />)
      } else {
        nodes.push(...renderPlain(part, key))
      }
    })
  }
  return <div className="space-y-1.5">{nodes}</div>
}
