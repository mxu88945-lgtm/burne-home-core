/**
 * 戏剧 TXT 导入解析。
 * 支持「小说式」对话记录（如 Tavo 导出）：
 *   行首「名字: 内容」标记一个发言；其后没有名字前缀的行算同一人继续说，
 *   直到下一行「名字:」。开头没名字的段落归给旁白「.」。
 * 全在本机解析，不上传。
 */

export interface ParsedTurn {
  name: string
  text: string
}

export interface ParsedDrama {
  speakers: { name: string; count: number }[]
  turns: ParsedTurn[]
}

// 行首「名字 + 冒号」：名字 1~16 字，不含空白/冒号/句读/引号（避免把旁白/台词误判成发言人）
const SPEAKER_RE = /^([^\s:：，。！？、；…"'""''『』「」（）()]{1,16})[:：][ \t]?(.*)$/

function isNameLike(name: string): boolean {
  if (name === '.') return true // 旁白
  if (!name) return false
  if (/^\d+$/.test(name)) return false // 纯数字
  // 首字符必须是中日韩文字或英文字母，排除「——纸条上写着」「**旁白」这类
  if (!/^[\p{Script=Han}A-Za-z぀-ヿ가-힯]/u.test(name)) return false
  return true
}

export function parseDramaTxt(raw: string): ParsedDrama {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const turns: ParsedTurn[] = []
  let cur: ParsedTurn | null = null

  for (const line of lines) {
    const m = line.match(SPEAKER_RE)
    if (m && isNameLike(m[1])) {
      if (cur) turns.push(cur)
      cur = { name: m[1], text: m[2] ?? '' }
    } else if (cur) {
      cur.text += '\n' + line
    } else if (line.trim()) {
      // 开头没有发言人前缀的内容 → 归给旁白「.」
      cur = { name: '.', text: line }
    }
  }
  if (cur) turns.push(cur)

  const cleaned = turns
    .map((t) => ({ name: t.name, text: t.text.replace(/^\n+/, '').replace(/\s+$/, '').trim() }))
    .filter((t) => t.text.length > 0)

  const counts = new Map<string, number>()
  for (const t of cleaned) counts.set(t.name, (counts.get(t.name) || 0) + 1)
  const speakers = [...counts.entries()].map(([name, count]) => ({ name, count }))

  return { speakers, turns: cleaned }
}
