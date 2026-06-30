/**
 * 角色卡导入（Tavern / SillyTavern V1 / V2 / V3）。
 * - JSON：直接解析
 * - PNG：从 tEXt/iTXt 块里取出嵌入的角色卡（keyword: chara / ccv3，base64 的 JSON），图片本身当头像
 * 解析出：名字 / 人设(persona) / 开场白(greeting) / 头像 / 世界书(lore)
 * 全在浏览器本地完成，不上传。
 */

import type { LoreEntry } from '@/store/dramaStore'
import { fileToDataUrl } from '@/lib/image'

export interface ParsedCard {
  name: string
  persona: string
  greeting: string
  avatarImg?: string
  lore: LoreEntry[]
}

function uid(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `lore-${Date.now()}-${Math.random()}`
}

/** 按当前对话挑出要注入的世界书条目：常驻(📌)always + 关键词(🔑)命中。省 token。 */
export function buildLoreText(lore: LoreEntry[] | undefined, haystack: string): string {
  if (!lore || !lore.length) return ''
  const hay = haystack.toLowerCase()
  const picked = lore.filter(
    (e) => e.enabled && e.content.trim() && (e.constant || e.keys.some((k) => k && hay.includes(k.toLowerCase()))),
  )
  if (!picked.length) return ''
  return picked.map((e) => `【${e.name}】\n${e.content.trim()}`).join('\n\n')
}

/** base64(可能是 UTF-8 的 JSON) → 对象 */
function b64ToObj(b64: string): unknown {
  const bin = atob(b64.trim())
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const text = new TextDecoder('utf-8').decode(bytes)
  return JSON.parse(text)
}

/** 从 PNG 的 tEXt/iTXt 块里找角色卡 JSON（优先 ccv3，其次 chara） */
function readPngCard(buf: ArrayBuffer): unknown | null {
  const bytes = new Uint8Array(buf)
  // PNG 签名
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null
  const dv = new DataView(buf)
  let off = 8
  let chara: string | null = null
  let ccv3: string | null = null
  const latin1 = (s: number, e: number) => {
    let out = ''
    for (let i = s; i < e; i++) out += String.fromCharCode(bytes[i])
    return out
  }
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off)
    off += 4
    const type = latin1(off, off + 4)
    off += 4
    const dataStart = off
    if (type === 'tEXt') {
      let z = dataStart
      while (z < dataStart + len && bytes[z] !== 0) z++
      const keyword = latin1(dataStart, z)
      const text = latin1(z + 1, dataStart + len)
      if (keyword === 'ccv3') ccv3 = text
      else if (keyword === 'chara') chara = text
    } else if (type === 'iTXt') {
      // keyword \0 compFlag compMethod langTag \0 transKeyword \0 text
      let p = dataStart
      while (p < dataStart + len && bytes[p] !== 0) p++
      const keyword = latin1(dataStart, p)
      const compFlag = bytes[p + 1]
      if (compFlag === 0 && (keyword === 'chara' || keyword === 'ccv3')) {
        // 跳过 compMethod(1) + langTag\0 + transKeyword\0
        let q = p + 3
        while (q < dataStart + len && bytes[q] !== 0) q++ // langTag
        q++
        while (q < dataStart + len && bytes[q] !== 0) q++ // transKeyword
        q++
        const text = new TextDecoder('utf-8').decode(bytes.subarray(q, dataStart + len))
        if (keyword === 'ccv3') ccv3 = text
        else chara = text
      }
    }
    off = dataStart + len + 4 // 跳过 data + CRC
    if (type === 'IEND') break
  }
  const raw = ccv3 || chara
  if (!raw) return null
  try {
    return b64ToObj(raw)
  } catch {
    // 个别卡 iTXt 里直接是明文 JSON
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
}

type AnyObj = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** 把卡里的设定字段拼成人设正文 */
function buildPersona(d: AnyObj): string {
  const parts: string[] = []
  const push = (label: string, v: unknown) => {
    const t = str(v).trim()
    if (t) parts.push(`【${label}】\n${t}`)
  }
  push('人物设定', d.description)
  push('性格', d.personality)
  push('情景', d.scenario)
  push('对话示例', d.mes_example)
  push('系统提示', d.system_prompt)
  return parts.join('\n\n')
}

/** 解析世界书（character_book / 兼容 entries 为数组或对象） */
function parseBook(book: unknown): LoreEntry[] {
  if (!book || typeof book !== 'object') return []
  const raw = (book as AnyObj).entries
  const arr: AnyObj[] = Array.isArray(raw)
    ? (raw as AnyObj[])
    : raw && typeof raw === 'object'
      ? (Object.values(raw as AnyObj) as AnyObj[])
      : []
  return arr
    .map((e): LoreEntry => {
      const keysRaw = (e.keys ?? e.key ?? []) as unknown
      const keys = Array.isArray(keysRaw)
        ? keysRaw.map((k) => str(k).trim()).filter(Boolean)
        : str(keysRaw)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
      return {
        id: uid(),
        name: str(e.comment) || str(e.name) || keys[0] || '设定',
        keys,
        content: str(e.content),
        constant: e.constant === true,
        enabled: e.enabled !== false && e.disable !== true,
      }
    })
    .filter((e) => e.content.trim())
}

function normalize(obj: unknown): ParsedCard {
  const o = (obj || {}) as AnyObj
  // V2/V3 包在 data 里；V1 是平铺
  const d = (o.data && typeof o.data === 'object' ? (o.data as AnyObj) : o) as AnyObj
  const name = str(d.name) || str(o.name) || '角色'
  const greeting = str(d.first_mes) || str(o.first_mes)
  const lore = parseBook(d.character_book ?? o.character_book)
  return { name, persona: buildPersona(d), greeting, lore }
}

/** 解析一个角色卡文件（.json 或 .png） */
export async function parseCardFile(file: File): Promise<ParsedCard> {
  const isPng = /\.png$/i.test(file.name) || file.type === 'image/png'
  if (isPng) {
    const buf = await file.arrayBuffer()
    const obj = readPngCard(buf)
    if (!obj) throw new Error('这张 PNG 里没找到角色卡数据（可能不是角色卡图，或用了压缩格式，试试导出 JSON）')
    const card = normalize(obj)
    try {
      card.avatarImg = await fileToDataUrl(file, 256) // 图片本身当头像
    } catch {
      /* 头像失败不影响导入 */
    }
    return card
  }
  // JSON
  const text = await file.text()
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('不是合法的 JSON 角色卡')
  }
  return normalize(obj)
}
