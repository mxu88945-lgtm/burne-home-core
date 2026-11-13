/**
 * 渠道按中转地址（baseUrl 的 host）自动分组，只影响列表显示顺序，不改存储。
 * - 分组键：baseUrl 的小写 hostname；地址为空/不合法时退回渠道名。
 * - 组的顺序按首次出现；组内保持原顺序。
 */

export interface GroupableChannel {
  name?: string
  baseUrl?: string
}

export interface ChannelGroup<T> {
  key: string
  items: T[]
}

export function channelGroupKey(c: GroupableChannel): string {
  const raw = (c.baseUrl || '').trim()
  if (raw) {
    try {
      const host = new URL(raw).hostname.toLowerCase()
      if (host) return host
    } catch {
      /* fall through */
    }
  }
  return (c.name || '').trim()
}

export function groupChannelsByHost<T extends GroupableChannel>(channels: T[]): ChannelGroup<T>[] {
  const groups: ChannelGroup<T>[] = []
  const byKey = new Map<string, ChannelGroup<T>>()
  for (const c of channels) {
    const key = channelGroupKey(c)
    let g = byKey.get(key)
    if (!g) {
      g = { key, items: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.items.push(c)
  }
  return groups
}

/** 扁平化：同 host 的渠道排在一起。 */
export function sortChannelsByHost<T extends GroupableChannel>(channels: T[]): T[] {
  return groupChannelsByHost(channels).flatMap((g) => g.items)
}
