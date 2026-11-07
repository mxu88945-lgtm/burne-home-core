/**
 * 歌词：支持 LRC（[mm:ss.xx]歌词）和纯文本（没有时间轴）。
 * 一起听歌：把「正在放哪首、放到哪、当前这几句歌词」告诉模型。
 */

export interface LyricLine {
  /** 秒；纯文本歌词为 -1 */
  t: number
  text: string
}

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLyrics(raw: string): LyricLine[] {
  const out: LyricLine[] = []
  let timed = false
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    TAG.lastIndex = 0
    const stamps: number[] = []
    let m: RegExpExecArray | null
    let last = 0
    while ((m = TAG.exec(line))) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + frac)
      last = TAG.lastIndex
    }
    if (stamps.length) {
      timed = true
      const text = line.slice(last).trim()
      if (text) for (const t of stamps) out.push({ t, text })
      continue
    }
    // [ti:xx] [ar:xx] 之类的标签行跳过
    if (/^\[[a-z]+:.*\]$/i.test(line.trim())) continue
    const text = line.trim()
    if (text) out.push({ t: -1, text })
  }
  if (timed) return out.filter((l) => l.t >= 0).sort((a, b) => a.t - b.t)
  return out
}

export function isTimed(lines: LyricLine[]): boolean {
  return lines.length > 0 && lines[0].t >= 0
}

/** 当前播到第几句（没到第一句返回 -1） */
export function lyricIndexAt(lines: LyricLine[], pos: number): number {
  if (!isTimed(lines)) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= pos + 0.2) idx = i
    else break
  }
  return idx
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export interface NowPlaying {
  name: string
  playing: boolean
  pos: number
  dur: number
}

/** 注入 system 的「一起听歌」段；没在播就不注入 */
export function buildMusicNote(now: NowPlaying | null, lines: LyricLine[]): string {
  if (!now || !now.playing || !now.name) return ''
  const parts = [`她正在放歌：《${now.name}》，放到 ${fmt(now.pos)}${now.dur ? ` / ${fmt(now.dur)}` : ''}。你们像是在一起听。`]
  if (lines.length) {
    if (isTimed(lines)) {
      const i = lyricIndexAt(lines, now.pos)
      if (i < 0) parts.push('前奏中，还没唱到歌词。')
      else {
        const from = Math.max(0, i - 2)
        const to = Math.min(lines.length, i + 3)
        const seg = lines.slice(from, to).map((l, k) => (from + k === i ? `▶ ${l.text}` : `  ${l.text}`))
        parts.push('现在唱到（▶ 是这一句）：\n' + seg.join('\n'))
      }
    } else {
      let text = lines.map((l) => l.text).join(' / ')
      if (text.length > 600) text = text.slice(0, 600) + '…'
      parts.push('这首歌的歌词：' + text)
    }
  }
  parts.push('可以自然地聊这首歌、顺着歌词说点什么，别每条都提，别编造没给你的歌词，不要提“系统”“提示”。')
  return '\n\n【一起听歌】\n' + parts.join('\n')
}

/** 从文件名猜歌名/歌手：「阿梨粤-我和春天有个约会(女声版)」→ { title:'我和春天有个约会', artist:'阿梨粤' } */
export function guessSongMeta(name: string): { title: string; artist: string } {
  let s = name.replace(/\.[a-z0-9]{2,4}$/i, '').trim()
  let artist = ''
  const m = s.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (m) {
    artist = m[1].trim()
    s = m[2]
  }
  const title = s.replace(/[（(【[].*?[）)】\]]/g, '').replace(/[-–—]+$/, '').trim()
  return { title: title || s.trim(), artist }
}

interface LrclibItem { trackName?: string; artistName?: string; syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean }

/** 从搜索结果里挑歌词：先同名带时间轴，再同名纯文本，再任一带时间轴（翻唱多数歌词一样） */
export function pickLyrics(items: LrclibItem[], title: string): string {
  const norm = (x: string) => x.replace(/\s+/g, '').toLowerCase()
  const t = norm(title)
  const ok = items.filter((i) => !i.instrumental)
  const same = ok.filter((i) => norm(i.trackName || '') === t)
  return (
    same.find((i) => i.syncedLyrics)?.syncedLyrics ||
    same.find((i) => i.plainLyrics)?.plainLyrics ||
    ok.filter((i) => norm(i.trackName || '').includes(t)).find((i) => i.syncedLyrics)?.syncedLyrics ||
    ''
  )
}

/** 网上自动找歌词（lrclib.net，免费、可跨域）。找不到返回空串 */
export async function fetchOnlineLyrics(name: string, signal?: AbortSignal): Promise<string> {
  const { title, artist } = guessSongMeta(name)
  if (!title) return ''
  const get = async (q: string) => {
    const r = await fetch(`https://lrclib.net/api/search?${q}`, { signal })
    if (!r.ok) return [] as LrclibItem[]
    return (await r.json()) as LrclibItem[]
  }
  const enc = encodeURIComponent
  let found = ''
  if (artist) found = pickLyrics(await get(`track_name=${enc(title)}&artist_name=${enc(artist)}`), title)
  if (!found) found = pickLyrics(await get(`track_name=${enc(title)}`), title)
  return found
}
