export function normalizeArchiveText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function evenlySample(values: string[], max: number): string[] {
  if (values.length <= max) return values
  const result: string[] = []
  const step = values.length / max
  for (let i = 0; i < max; i += 1) result.push(values[Math.floor(i * step)])
  return result
}

/**
 * 中文用连续二字词，拉丁文字用完整词。单个汉字噪声太大，不进入倒排索引。
 */
export function archiveTokens(value: string): string[] {
  const normalized = normalizeArchiveText(value)
  const tokens = new Set<string>()
  for (const word of normalized.match(/[a-z0-9][a-z0-9._-]{1,}/gu) ?? []) {
    tokens.add(word)
  }
  for (const run of normalized.match(/[\u3400-\u9fff]+/gu) ?? []) {
    const chars = Array.from(run)
    for (let i = 0; i < chars.length - 1; i += 1) tokens.add(`${chars[i]}${chars[i + 1]}`)
  }
  return [...tokens]
}

/** 标题词永远保留；正文词均匀抽样，避免单个大切片制造几千个索引键。 */
export function buildArchiveTerms(title: string, text: string, max = 144): string[] {
  const titleTerms = archiveTokens(title)
  const bodyTerms = archiveTokens(text).filter((token) => !titleTerms.includes(token))
  return [...titleTerms, ...evenlySample(bodyTerms, Math.max(0, max - titleTerms.length))].slice(0, max)
}

/** 查询词按信息量排序：完整词优先，再查二字词。 */
export function buildArchiveQueryTerms(query: string, max = 12): string[] {
  const normalized = normalizeArchiveText(query)
  const exact = normalized.length >= 2 && normalized.length <= 36 ? [normalized] : []
  return [...new Set([...exact, ...archiveTokens(normalized)])]
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
}
