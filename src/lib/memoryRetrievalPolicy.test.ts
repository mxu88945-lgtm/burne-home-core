import { describe, expect, it } from 'vitest'
import {
  buildMemoryRetrievalCapabilityNote,
  isPrivateMemoryLookup,
} from '@/lib/memoryRetrievalPolicy'

describe('private memory retrieval policy', () => {
  it('keeps old-chat requests away from public web search', () => {
    expect(isPrivateMemoryLookup('你去旧聊天里搜一下高定衣帽间')).toBe(true)
    expect(isPrivateMemoryLookup('你还记得我们上次说过的那句话吗')).toBe(true)
    expect(isPrivateMemoryLookup('查一下记忆库里的原话')).toBe(true)
  })

  it('keeps explicit public searches online', () => {
    expect(isPrivateMemoryLookup('去网上搜一下今天的新闻')).toBe(false)
    expect(isPrivateMemoryLookup('查官网里最新的模型资料')).toBe(false)
    expect(isPrivateMemoryLookup('普通聊聊天')).toBe(false)
  })

  it('describes proactive recall without pretending to expose the database', () => {
    const note = buildMemoryRetrievalCapabilityNote('伯恩')
    expect(note).toContain('主动规划检索词')
    expect(note).toContain('不能自由浏览整座数据库')
    expect(note).toContain('第三方角色台词')
  })
})
