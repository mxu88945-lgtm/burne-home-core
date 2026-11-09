/**
 * 对齐顾祁砚：不在后台另跑一次提炼，而是让伯恩自己在回复末尾写 [记忆:一句话]，
 * 前端把标记藏起来、存进记忆库。另外把最近 36 小时她自己的原话里的近况（吃喝、身体、
 * 正在做的事、项目进展）作为短期近况带上，不写进永久记忆。
 */
import type { ChatMsg } from '@/store/chatStore'
import { hideDiaryWhileStreaming } from '@/lib/diary'

const TAG = /\[\s*(?:记忆|记住|存记忆|memory)\s*[:：]\s*([^\]\n]+)\]/gi

export const MEMORY_TAG_PROMPT =
  '\n\n【记忆】仅当她明确要求记住，或你判断一个月后仍然重要（身份、关系、长期偏好、郑重承诺、重大事件）时，在回复最后另起一行写 [记忆:一句话]，一次最多两条；闲聊、一时情绪、临时安排不记。这个标记会自动隐藏并存进记忆库。'

function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 取出回复里的记忆标记，返回清理后的正文和要存的条目。 */
export function extractMemoryTags(text: string): { clean: string; saves: string[] } {
  const saves: string[] = []
  const clean = text.replace(new RegExp(TAG.source, 'gi'), (_m, c: string) => {
    const t = (c || '').trim()
    if (t && !saves.includes(t)) saves.push(t)
    return ''
  })
  return { clean: saves.length ? tidy(clean) : clean, saves }
}

/** 其他同样要藏起来的隐藏标签：[人物:名字|内容]、[搜索:关键词]、[相册:关键词]。 */
const OTHER_HIDDEN = /\[\s*(?:人物|搜索|搜|search|相册|album)\s*[:：][^\]\n]*\]/gi

/** 流式显示用：完整标记和末尾写了一半的标记（记忆 / 人物 / 搜索 / 相册 / 私记）都不露出来。 */
export function hideMemoryTagsWhileStreaming(text: string): string {
  const out = hideDiaryWhileStreaming(text).replace(new RegExp(TAG.source, 'gi'), '').replace(new RegExp(OTHER_HIDDEN.source, 'gi'), '')
  return out
    .replace(
      /\[\s*(?:记(?:忆|住)?|存(?:记(?:忆)?)?|m(?:e(?:m(?:o(?:r(?:y)?)?)?)?)?|人(?:物)?|搜(?:索)?|相(?:册)?|私(?:记|人(?:日(?:记)?)?)?|a(?:l(?:b(?:u(?:m)?)?)?)?|s(?:e(?:a(?:r(?:c(?:h)?)?)?)?)?)?\s*(?:[:：][^\]\n]*)?$/i,
      '',
    )
    .trimEnd()
}

const LOOKBACK_MS = 36 * 3600 * 1000
const MAX_ITEMS = 8
const CHAR_BUDGET = 1100

function candidate(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const meal = /(?:早餐|早饭|午餐|午饭|晚餐|晚饭|宵夜|吃(?:了|完|过|的是)|喝(?:了|完|过|的是)|刚(?:刚|才)?吃|刚(?:刚|才)?喝|水果)/
  const activity = /(?:刚刚?|刚才|今天|今早|上午|中午|下午|傍晚|今晚|昨晚|等会|待会|一会儿?|准备|正在|明天).{0,28}(?:洗澡|洗漱|睡觉|午休|拖地|做饭|烧水|煮水|换尿垫|喂|出门|回家|工作|运动|吃|喝|买|去)/
  const health = /(?:头疼|偏头痛|肚子疼|经期|痛经|腰酸|不舒服|出汗|发烧|发热|感冒|吃药|困了|很困|累了|很累|鼻子|喉咙)/
  const project = /(?:端口|仓库|代码|部署|推送|上线|更新|记忆系统|bug|问题).{0,40}(?:修好|修完|修复|处理|改好|改完|完成)|(?:修好|修完|修复|改好|改完|完成).{0,40}(?:端口|仓库|代码|功能|记忆系统|bug|问题)/i
  if (!meal.test(t) && !activity.test(t) && !health.test(t) && !project.test(t)) return ''
  return [...t].slice(0, 220).join('')
}

function stamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 最近 36 小时她的原话里的近况（已经在上下文窗口里的不重复带）。 */
export function buildRecentStateNote(
  messages: ChatMsg[],
  sentIds: Set<string>,
  meName: string,
  nowMs = Date.now(),
): string {
  const rows: string[] = []
  const seen = new Set<string>()
  let used = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (!m || m.role !== 'me' || sentIds.has(m.id) || !m.ts) continue
    if (nowMs - m.ts > LOOKBACK_MS) continue
    const text = candidate(m.text || '')
    if (!text || seen.has(text)) continue
    const row = `[${stamp(m.ts)}] ${meName}：${text}`
    if (rows.length && used + row.length + 1 > CHAR_BUDGET) continue
    rows.push(row)
    seen.add(text)
    used += row.length + 1
    if (rows.length >= MAX_ITEMS) break
  }
  if (!rows.length) return ''
  rows.reverse()
  return (
    '\n\n【近况·最近36小时她的原话】\n' +
    rows.join('\n') +
    '\n只在相关话题里自然接上，不要逐条复述；「准备/等会」是计划，不能当成已经做完。'
  )
}
