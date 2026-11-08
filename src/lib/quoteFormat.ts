/**
 * 召回原话的统一格式：「M月D日 她说：…」/「M月D日 他说：…」。
 * 她 = 用户本人；他 = 当时回话的助手（跨窗口时身份按原文判断）。
 */

export const QUOTE_RULE =
  '引用这些原话时照原文说，例如「你那天说……」「你11月3日说……」，不要转述走样、不要添字改意；没列出的话不要说成原话。'

export function monthDay(ts: number | string | Date | undefined): string {
  if (ts == null || ts === '') return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function clipQuote(text: string, n: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : chars.join('')
}

/** 一行原话：日期缺失时写「日期不详」，approximate 时写「M月D日前后」。 */
export function quoteLine(
  when: number | string | Date | undefined,
  speaker: 'me' | 'companion',
  text: string,
  opts: { max?: number; approximate?: boolean } = {},
): string {
  const md = monthDay(when)
  const date = md ? `${md}${opts.approximate ? '前后' : ''}` : '日期不详'
  return `${date} ${speaker === 'me' ? '她' : '他'}说：${clipQuote(text, opts.max ?? 160)}`
}
