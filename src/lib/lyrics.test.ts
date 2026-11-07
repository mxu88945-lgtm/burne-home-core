import { describe, it, expect } from 'vitest'
import { parseLyrics, lyricIndexAt, buildMusicNote } from './lyrics'

const lrc = `[ti:晴天]
[ar:周杰伦]
[00:10.50]故事的小黄花
[00:15.00][01:20.00]从出生那年就飘着
[00:20.3]童年的荡秋千`

describe('lyrics', () => {
  it('解析 LRC，多时间戳展开并排序', () => {
    const l = parseLyrics(lrc)
    expect(l.map((x) => x.t)).toEqual([10.5, 15, 20.3, 80])
    expect(lyricIndexAt(l, 16)).toBe(1)
    expect(lyricIndexAt(l, 3)).toBe(-1)
  })
  it('纯文本歌词', () => {
    const l = parseLyrics('第一句\n\n第二句')
    expect(l).toEqual([{ t: -1, text: '第一句' }, { t: -1, text: '第二句' }])
  })
  it('注入当前句，暂停不注入', () => {
    const l = parseLyrics(lrc)
    const n = buildMusicNote({ name: '晴天', playing: true, pos: 16, dur: 269 }, l)
    expect(n).toContain('《晴天》')
    expect(n).toContain('▶ 从出生那年就飘着')
    expect(buildMusicNote({ name: '晴天', playing: false, pos: 16, dur: 269 }, l)).toBe('')
  })
})
