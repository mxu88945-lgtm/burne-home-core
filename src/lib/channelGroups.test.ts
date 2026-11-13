import { describe, expect, it } from 'vitest'
import { channelGroupKey, groupChannelsByHost, sortChannelsByHost } from './channelGroups'

const ch = (id: string, baseUrl: string, name = id) => ({ id, name, baseUrl })

describe('channelGroups', () => {
  it('uses lowercase hostname, falls back to name', () => {
    expect(channelGroupKey(ch('a', 'https://API.Foo.com/v1'))).toBe('api.foo.com')
    expect(channelGroupKey(ch('b', '', '我的渠道'))).toBe('我的渠道')
    expect(channelGroupKey(ch('c', 'not a url', 'X'))).toBe('X')
  })

  it('groups by first appearance, keeps order within group', () => {
    const list = [
      ch('1', 'https://a.com/v1'),
      ch('2', 'https://b.com/v1'),
      ch('3', 'https://A.com/other'),
      ch('4', ''),
      ch('5', 'https://b.com'),
    ]
    const groups = groupChannelsByHost(list)
    expect(groups.map((g) => g.key)).toEqual(['a.com', 'b.com', '4'])
    expect(groups.map((g) => g.items.map((c) => c.id))).toEqual([['1', '3'], ['2', '5'], ['4']])
    expect(sortChannelsByHost(list).map((c) => c.id)).toEqual(['1', '3', '2', '5', '4'])
    expect(list.map((c) => c.id)).toEqual(['1', '2', '3', '4', '5'])
  })
})
