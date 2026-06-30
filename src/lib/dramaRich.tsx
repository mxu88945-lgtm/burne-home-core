/**
 * 戏剧消息「美化」渲染：
 *  - <audio>/<source src> → 真·音乐播放器
 *  - ```…``` 代码块、连续的状态栏行（⏰时间/🗺地点/📌事件…）→ 可点开/关闭的灰色面板
 *  - 清掉裸标签 <em>/<plot>/<br> 等，只留内容
 * 安全：不用 dangerouslySetInnerHTML，只取 audio 的 src 当播放源。
 * 注意：key 用确定性序号（同一段文本每次渲染序号一致），保证折叠状态不会因重渲染丢失。
 */

import { useState, type ReactNode } from 'react'

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
  return /时间|地点|事件|状态|HP|好感|属性/.test(body) ? '状态栏' : '心声'
}

/** 普通文本：把连续的状态栏行收进折叠面板，其余按段落显示 */
function renderPlain(text: string, key: () => string): ReactNode[] {
  const t = stripTags(text)
  if (!t.trim()) return []
  const out: ReactNode[] = []
  let buf: string[] = []
  let stat: string[] = []
  const flushBuf = () => {
    const s = buf.join('\n').trim()
    if (s) out.push(<div key={key()} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{s}</div>)
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

/** 解析一段消息文本 → 美化后的 React 节点 */
export function DramaRich({ text }: { text: string }) {
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
        const body = stripTags(part)
        nodes.push(<Panel key={key()} label={panelLabel(body)} body={body} />)
      } else {
        nodes.push(...renderPlain(part, key))
      }
    })
  }
  return <div className="space-y-0.5">{nodes}</div>
}
