import { describe, expect, it } from 'vitest'
import { buildDramaTxt } from './dramaExport'
import type { DramaScene } from '@/store/dramaStore'

const scene: DramaScene = {
  id: 's', title: '雨夜', world: '', summary: '', createdAt: '',
  chars: [
    { id: 'me', name: '周惟惟', avatar: '', persona: '', color: '', isMe: true },
    { id: 'a', name: '顾屿', avatar: '', persona: '', color: '' },
    { id: 'n', name: '旁白', avatar: '', persona: '', color: '', npc: true },
  ],
  messages: [
    { id: '1', who: 'n', text: '雨下得很大。', at: '' },
    { id: '2', who: 'me', text: '你来了。', at: '' },
    { id: '3', who: 'a', text: '“嗯。”\n----------\n他收起伞。', at: '' },
    { id: '4', who: 'a', text: '', image: 'data:x', at: '' },
    { id: '5', who: 'gone', text: '门响了。', at: '' },
  ],
}

describe('drama TXT export (惟境格式)', () => {
  it('writes header and blocks the 惟境 importer understands', () => {
    const txt = buildDramaTxt(scene, new Date(2026, 9, 15))
    const [header, body] = [txt.slice(0, txt.indexOf('\n\n')), txt.slice(txt.indexOf('\n\n') + 2)]
    expect(header.split('\n').slice(0, 3)).toEqual(['雨夜', '角色：顾屿、旁白', '用户：周惟惟'])
    const blocks = body.trim().split(/\n\s*\n-{10,}\n\s*\n/)
    expect(blocks).toHaveLength(5)
    expect(blocks[1]).toBe('周惟惟\n你来了。')
    expect(blocks[2]).toBe('顾屿\n“嗯。”\n—----------\n他收起伞。')
    expect(blocks[3]).toBe('顾屿\n【图片】')
    expect(blocks[4]).toBe('旁白\n门响了。')
  })
})
