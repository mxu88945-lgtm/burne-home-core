/**
 * 他自己点歌：歌单不空时告诉伯恩有哪些歌，气氛合适时偶尔在回复最末尾单独一行写 [点歌:歌名]。
 * 前端把标记藏起来（显示 / 发回模型的历史 / 记忆 / 摘要 / 语义索引 / 导出都不带），
 * 回复收尾时取最后一个，按歌名模糊匹配歌单并切过去播放；消息下面出一个「🎵 他点了《X》」小条。
 * 歌名匹配移植自惟境 musicStore（v202 影视歌匹配）。
 */

const OPEN = '[\\[【［]'
const CLOSE = '[\\]】］]'
const NAME = '(?:点歌|點歌)'
const TAG_SRC = `${OPEN}\\s*${NAME}\\s*[:：]\\s*([^\\]】］\\n]{0,80}?)\\s*${CLOSE}`

/** 歌单进提示：最多 40 首，总长约 800 字 */
export const SONG_PROMPT_MAX_TITLES = 40
export const SONG_PROMPT_CHAR_BUDGET = 800
const TITLE_MAX = 40

function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function cleanTitle(raw: string): string {
  return (raw || '')
    .replace(/^[\s《「『"“]+|[\s》」』"”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 取出 [点歌:…]：返回去掉标记的正文和最后一个（非空）歌名。 */
export function extractSongTag(text: string): { clean: string; title: string } {
  if (!text) return { clean: text, title: '' }
  let title = ''
  let hit = false
  const clean = text.replace(new RegExp(TAG_SRC, 'gi'), (_m, body: string) => {
    hit = true
    const t = cleanTitle(body)
    if (t) title = t
    return ''
  })
  return { clean: hit ? tidy(clean) : text, title }
}

/** 只去掉标记（历史 / 记忆 / 摘要 / 索引 / 导出用）。 */
export function stripSongTags(text: string): string {
  return extractSongTag(text || '').clean
}

/** 流式显示：完整标记和末尾写了一半的标记都藏起来。 */
export function hideSongTagWhileStreaming(text: string): string {
  if (!text) return text
  return text
    .replace(new RegExp(TAG_SRC, 'gi'), '')
    .replace(new RegExp(`${OPEN}\\s*(?:点|點)(?:歌\\s*(?:[:：][^\\]】］\\n]*)?)?$`), '')
    .replace(new RegExp(`${OPEN}\\s*$`), '')
}

/** 拼进系统提示的点歌说明；歌单为空返回 ''。 */
export function buildSongPickPrompt(names: string[]): string {
  const seen = new Set<string>()
  const list: string[] = []
  let used = 0
  for (const raw of names) {
    if (list.length >= SONG_PROMPT_MAX_TITLES) break
    const chars = Array.from((raw || '').replace(/\s+/g, ' ').trim())
    if (!chars.length) continue
    const t = chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX).join('') : chars.join('')
    if (seen.has(t)) continue
    const piece = `《${t}》`
    if (list.length && used + piece.length > SONG_PROMPT_CHAR_BUDGET) break
    seen.add(t)
    list.push(piece)
    used += piece.length
  }
  if (!list.length) return ''
  return (
    `\n\n【点歌】她的歌单里有：${list.join('')}` +
    '\n气氛真的合适时可以偶尔给她点一首（不要每轮都点，大多数回复都不点），在回复最末尾单独一行写 [点歌:歌名]，歌名必须是上面歌单里的。这个标记会自动隐藏，播放器会切到这首歌。'
  )
}

// ---------- 歌名模糊匹配（移植自惟境 musicStore v202） ----------

// 常见繁体 → 简体（歌名里常见的字，够用就行，不引整套字库）。
const T2S: Record<string, string> = Object.fromEntries(
  Array.from(
    '戀恋兒儿團团愛爱聽听個个們们這这說说時时間间來来過过還还對对開开關关邊边裡里裏里後后會会經经與与為为無无見见樣样給给讓让誰谁發发夢梦憶忆淚泪憂忧傷伤歲岁風风雲云電电飛飞鳥鸟馬马魚鱼龍龙鳳凤華华國国東东門门長长遠远邊边紅红藍蓝綠绿黃黄靜静聲声樂乐歡欢戲戏劇剧話话語语詞词譜谱調调錯错對对壞坏憐怜難难離离鍾钟鐘钟記记憶忆漢汉場场燈灯塵尘輕轻舊旧親亲顏颜誓誓溫温濃浓淺浅緣缘終终結结斷断線线紙纸書书畫画筆笔煙烟織织輪轮轉转燒烧點点愛爱單单雙双萬万億亿實实壓压獨独憑凭歸归種种隨随悵怅懷怀從从幾几廣广陽阳陰阴雖虽戰战嗎吗嘆叹飄飘蕩荡漫漫謝谢塊块殘残擁拥擊击態态雪雪寫写滿满飯饭貓猫',
  ).reduce<Array<[string, string]>>((out, ch, i, all) => (i % 2 === 0 ? [...out, [ch, all[i + 1]]] : out), []),
)

const AUDIO_EXT = /\.(?:mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ape|alac|aiff?|caf|mp4|webm)$/i
const BRACKETS = /\([^()]*\)|（[^（）]*）|\[[^[\]]*\]|【[^【】]*】|《[^《》]*》|「[^「」]*」|『[^『』]*』|〔[^〔〕]*〕/g
const VERSION_SUFFIX =
  /(?:live|伴奏|纯音乐|remix|remaster(?:ed)?|instrumental|karaoke|inst|cover|demo|ver(?:sion)?|现场|现场版|完整版|女声版|男声版|dj版|dj|铃声版|高音质|无损|hq|sq)+$/

function toSimplified(value: string) {
  return Array.from(value)
    .map((ch) => T2S[ch] || ch)
    .join('')
}

/** 只留字母、数字和汉字，全角转半角，繁转简，小写，去掉 live/伴奏/remix 这类尾巴。 */
function squashTitle(value: string) {
  let out = toSimplified(value.normalize('NFKC').toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, '')
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(VERSION_SUFFIX, '')
    if (next === out || !next) break
    out = next
  }
  return out
}

/** 一个歌名的比较用写法：整串 + 按「 - 」「–」「—」「-」拆出的各段（去扩展名、括号、编号）。 */
export function songTitleKeys(raw: string): { whole: string; parts: string[] } {
  let text = (raw || '').normalize('NFKC').trim().replace(AUDIO_EXT, '')
  text = text.replace(/[《「『]([^《》「」『』]{1,60})[》」』]/g, ' $1 ')
  text = text.replace(BRACKETS, ' ')
  const parts = text
    .split(/\s+-+\s+|\s*[–—]+\s*|(?<=[\p{Script=Han}\p{L}\p{N}.)])-(?=[\p{Script=Han}\p{L}\p{N}])|\s*[/／|｜_]\s*/u)
    .map(squashTitle)
    .filter(Boolean)
  const clean = parts.map((part) => part.replace(/^\d{1,3}(?=\D)/, '')).filter(Boolean)
  return { whole: squashTitle(text).replace(/^\d{1,3}(?=\D)/, ''), parts: clean }
}

/** 短的一方至少 2 个字，且占长的一方至少 minShare（防止只靠歌手名那一小截就算匹配）。 */
function contains(long: string, short: string, minShare: number) {
  return short.length >= 2 && long.includes(short) && short.length >= Math.ceil(long.length * minShare)
}

/** 按歌名模糊匹配歌单（相同 > 歌单包含歌名 > 歌名包含歌单段 > 字符高度重合）；对不上返回 null。 */
export function findTrackByTitle<T extends { id: string; name: string; title?: string; artist?: string }>(
  tracks: T[],
  title: string,
  artist = '',
): T | null {
  const wantKeys = songTitleKeys(title)
  const head = (wantKeys.parts[0] || '').match(/^(?:\p{Script=Han}+|[^\p{Script=Han}]+)/u)?.[0] || ''
  const wants = Array.from(
    new Set([wantKeys.parts[0], wantKeys.whole, head.length >= 2 ? head : ''].filter((k): k is string => Boolean(k))),
  )
  if (!wants.length || !tracks.length) return null
  const wantArtist = squashTitle(artist)
  let best: { track: T; score: number } | null = null
  for (const track of tracks) {
    const fields = [track.title, track.name, track.artist && track.title ? `${track.title} - ${track.artist}` : ''].filter(
      (v): v is string => Boolean(v),
    )
    const keys = new Set<string>()
    let haystack = ''
    for (const field of fields) {
      const k = songTitleKeys(field)
      if (k.whole) keys.add(k.whole)
      k.parts.forEach((p) => keys.add(p))
      haystack += k.whole
    }
    if (track.artist) haystack += squashTitle(track.artist)
    let score = 0
    for (const want of wants) {
      for (const key of keys) {
        let s = 0
        if (key === want) s = 100
        else if (contains(key, want, want.length >= 3 ? 0 : 0.4)) s = 80
        else if (contains(want, key, 0.6)) s = 60
        if (s) s += Math.min(want.length, key.length)
        if (s > score) score = s
      }
    }
    if (!score) {
      const want = wants[0]
      for (const key of keys) {
        const chars = new Set(Array.from(key))
        const hit = Array.from(want).filter((ch) => chars.has(ch)).length
        const ratio = hit / Math.max(want.length, 1)
        if (want.length >= 3 && ratio >= 0.75 && Math.abs(key.length - want.length) <= 2) score = Math.max(score, Math.round(40 * ratio))
      }
    }
    if (score && wantArtist && wantArtist.length >= 2 && haystack.includes(wantArtist)) score += 10
    if (score && (!best || score > best.score)) best = { track, score }
  }
  return best?.track ?? null
}
