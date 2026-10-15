/**
 * 戏剧导出 TXT —— 惟境「对话 TXT」格式，可以直接在惟境里导入：
 *   标题
 *   角色：A、B
 *   用户：我
 *   导出时间：…
 *   （空行）
 *   作者\n正文
 *   --------------------
 *   作者\n正文
 * 「这是我」的卡记为用户；图片消息只留文字，没有文字的写【图片】。全在本机生成，不上传。
 */
import type { DramaScene } from '@/store/dramaStore'

const SEPARATOR = '\n\n--------------------\n\n'

/** 名字里不能有换行；正文里刚好有一整行横线时，挪开一点免得被当成分隔线。 */
const cleanName = (name: string) => { const n = name.replace(/\s+/g, ' ').trim(); return /[\p{L}\p{N}]/u.test(n) ? n : '旁白' }
const cleanText = (text: string) => text.replace(/\r\n?/g, '\n').replace(/^\s*-{10,}\s*$/gm, (line) => `—${line.trim()}`).trim()

export function buildDramaTxt(scene: DramaScene, exportedAt = new Date(), range?: { start: number; end: number }): string {
  const me = scene.chars.find((c) => c.isMe)
  const userName = cleanName(me?.name || '我')
  const nameOf = (who: string) => cleanName(scene.chars.find((c) => c.id === who)?.name || '旁白')
  const total = scene.messages.length
  const start = range ? Math.min(total, Math.max(1, Math.min(range.start, range.end))) : 1
  const end = range ? Math.min(total, Math.max(1, Math.max(range.start, range.end))) : total
  const partial = Boolean(range) && (start > 1 || end < total)
  const messages = scene.messages.slice(start - 1, end)
    .map((m) => {
      const text = cleanText(m.text || '') || (m.image ? '【图片】' : '')
      return text ? { author: m.who === me?.id ? userName : nameOf(m.who), text } : null
    })
    .filter((m): m is { author: string; text: string } => Boolean(m))
  const actors = [...new Set([
    ...scene.chars.filter((c) => !c.isMe).map((c) => cleanName(c.name)),
    ...messages.filter((m) => m.author !== userName).map((m) => m.author),
  ])].filter((name) => name !== userName)
  const title = cleanName(scene.title || '戏剧')
  const header = `${title}\n角色：${actors.join('、') || '旁白'}\n用户：${userName}${partial ? `\n范围：第 ${start}–${end} 条（共 ${total} 条）` : ''}\n导出时间：${exportedAt.toLocaleString()}`
  return `${header}\n\n${messages.map((m) => `${m.author}\n${m.text}`).join(SEPARATOR)}\n`
}

export function downloadDramaTxt(scene: DramaScene, range?: { start: number; end: number }): void {
  const blob = new Blob([buildDramaTxt(scene, new Date(), range)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(scene.title || '戏剧').replace(/[\\/:*?"<>|]/g, '_')}${range ? `_${Math.min(range.start, range.end)}-${Math.max(range.start, range.end)}` : ''}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
