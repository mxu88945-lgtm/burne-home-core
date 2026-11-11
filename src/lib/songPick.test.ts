import { describe, expect, it } from 'vitest'
import {
  buildSongPickPrompt,
  extractSongTag,
  findTrackByTitle,
  hideSongTagWhileStreaming,
  stripSongTags,
  SONG_PROMPT_MAX_TITLES,
} from './songPick'
import { hideMemoryTagsWhileStreaming } from './memoryTags'
import { messagePromptText } from './contextCompression'

describe('点歌标记解析', () => {
  it('取出最后一个歌名并去掉标记', () => {
    const r = extractSongTag('今晚就听这个吧。\n[点歌:晴天]\n[点歌：《夜曲》]')
    expect(r.title).toBe('夜曲')
    expect(r.clean).toBe('今晚就听这个吧。')
  })
  it('全角括号和全角冒号都认', () => {
    expect(extractSongTag('嗯\n【点歌：稻香】').title).toBe('稻香')
    expect(extractSongTag('嗯\n［点歌:稻香］').title).toBe('稻香')
    expect(extractSongTag('嗯\n【点歌:稻香】').clean).toBe('嗯')
  })
  it('没有标记时原样返回', () => {
    const t = '普通的一句 [不是标记]'
    expect(extractSongTag(t)).toEqual({ clean: t, title: '' })
    expect(stripSongTags(t)).toBe(t)
  })
  it('历史/摘要文本也去掉标记', () => {
    expect(messagePromptText({ id: '1', role: 'companion', text: '好\n[点歌:晴天]', at: '' })).toBe('好')
  })
})

describe('流式时藏起写了一半的标记', () => {
  it.each(['说完了\n[', '说完了\n[点', '说完了\n[点歌', '说完了\n[点歌:晴', '说完了\n【点歌：晴天', '说完了\n［点'])('%s', (t) => {
    expect(hideSongTagWhileStreaming(t).trim()).toBe('说完了')
    expect(hideMemoryTagsWhileStreaming(t)).toBe('说完了')
  })
  it('完整标记也藏', () => {
    expect(hideMemoryTagsWhileStreaming('说完了\n[点歌:晴天]')).toBe('说完了')
  })
  it('正文里的方括号不受影响', () => {
    expect(hideSongTagWhileStreaming('看 [这个] 好')).toBe('看 [这个] 好')
  })
})

describe('点歌提示', () => {
  it('歌单为空不加', () => {
    expect(buildSongPickPrompt([])).toBe('')
    expect(buildSongPickPrompt(['  ', ''])).toBe('')
  })
  it('列出歌名、限 40 首和约 800 字', () => {
    const p = buildSongPickPrompt([' 晴天 ', '夜曲', '晴天'])
    expect(p).toContain('《晴天》《夜曲》')
    expect(p).toContain('[点歌:歌名]')
    const many = Array.from({ length: 100 }, (_, i) => `歌${i}`)
    expect((buildSongPickPrompt(many).match(/《/g) || []).length).toBe(SONG_PROMPT_MAX_TITLES)
    const long = Array.from({ length: 40 }, (_, i) => `${'很长的歌名'.repeat(8)}${i}`)
    const list = buildSongPickPrompt(long).split('\n')[2]
    expect(list.length).toBeLessThanOrEqual(820)
  })
})

describe('歌名模糊匹配', () => {
  const tracks = [
    { id: 'a', name: '周杰伦 - 晴天' },
    { id: 'b', name: '07 夜曲 (Live)' },
    { id: 'c', name: '後來-劉若英' },
    { id: 'd', name: 'Yesterday Once More [伴奏]' },
    { id: 'e', name: '千里之外.mp3' },
  ]
  it('去歌手段、编号、括号、扩展名', () => {
    expect(findTrackByTitle(tracks, '晴天')?.id).toBe('a')
    expect(findTrackByTitle(tracks, '夜曲')?.id).toBe('b')
    expect(findTrackByTitle(tracks, '千里之外')?.id).toBe('e')
    expect(findTrackByTitle(tracks, 'yesterday once more')?.id).toBe('d')
  })
  it('繁转简', () => {
    expect(findTrackByTitle(tracks, '后来')?.id).toBe('c')
  })
  it('带版本尾巴、全角也能对上', () => {
    expect(findTrackByTitle(tracks, '《晴天》（Live）')?.id).toBe('a')
    expect(findTrackByTitle(tracks, '晴天 - 周杰伦')?.id).toBe('a')
  })
  it('对不上返回 null', () => {
    expect(findTrackByTitle(tracks, '海阔天空')).toBeNull()
    expect(findTrackByTitle([], '晴天')).toBeNull()
  })
})
