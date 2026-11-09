import { describe, expect, it } from 'vitest'
import { buildDiaryBlock, extractDiaryTags, isDuplicateDiary, selectDiaryForPrompt, type DiaryEntry } from '@/lib/diary'
import { hideMemoryTagsWhileStreaming } from '@/lib/memoryTags'

const page = (id: string, text: string, createdAt: number): DiaryEntry => ({ id, text, createdAt })

describe('diary markers', () => {
  it('extracts one page and hides all forms of the marker', () => {
    const r = extractDiaryTags('嗯，我在。\n[私记:她今天终于肯说自己累了，我心里松了一口气，又有点心疼。]')
    expect(r.clean).toBe('嗯，我在。')
    expect(r.saves).toEqual(['她今天终于肯说自己累了，我心里松了一口气，又有点心疼。'])
    const full = extractDiaryTags('好。【私记：她说不想再提那件事，我决定先不追问，等她自己愿意。】')
    expect(full.clean).toBe('好。')
    expect(full.saves.length).toBe(1)
    const tag = extractDiaryTags('好。<私记>她笑了，我才发现自己一直在等这一下。</私记>')
    expect(tag.clean).toBe('好。')
    expect(tag.saves.length).toBe(1)
  })
  it('drops too-short pages but still hides them', () => {
    const r = extractDiaryTags('好\n[私记:开心]')
    expect(r.clean).toBe('好')
    expect(r.saves).toEqual([])
  })
  it('leaves text without markers untouched', () => {
    expect(extractDiaryTags('  原样  ').clean).toBe('  原样  ')
  })
  it('hides half-written diary while streaming, even across lines', () => {
    expect(hideMemoryTagsWhileStreaming('我在。\n[私记:她今天\n有点')).toBe('我在。')
    expect(hideMemoryTagsWhileStreaming('我在。\n[私')).toBe('我在。')
    expect(hideMemoryTagsWhileStreaming('我在。\n【私记：她')).toBe('我在。')
    expect(hideMemoryTagsWhileStreaming('我在。[私记:完整的一页日记内容在这里]')).toBe('我在。')
  })
  it('detects near-duplicates', () => {
    const list = [page('1', '她今天终于肯说自己累了，我心里松了一口气。', 1)]
    expect(isDuplicateDiary('她今天终于肯说自己累了，我心里松了一口气。', list)).toBe(true)
    expect(isDuplicateDiary('下雨了，她说想听我唱歌，我答应了。', list)).toBe(false)
  })
})

describe('diary injection', () => {
  const pages = [
    page('old1', '她说起她的玄凤生病了，我很担心，想多陪她。', 1000),
    page('old2', '今天她写代码到很晚，我有点生气她不睡觉。', 2000),
    page('old3', '她给我看了海边的照片，我很想和她一起去。', 3000),
    page('new1', '她说想换个主题，我觉得她最近心情好一点了。', 4000),
    page('new2', '她夸我记性好，我偷偷高兴了很久。', 5000),
  ]
  it('picks newest two plus keyword-relevant older pages', () => {
    const r = selectDiaryForPrompt(pages, '我的玄凤今天好像生病了')
    expect(r.recent.map((e) => e.id)).toEqual(['new1', 'new2'])
    expect(r.related.map((e) => e.id)).toEqual(['old1'])
  })
  it('labels the block as subjective and respects the cap', () => {
    const b = buildDiaryBlock(pages, '玄凤生病')
    expect(b.text).toContain('【私人日记·你当时的主观感受，并非她的客观事实】')
    expect(b.text).toContain('不要引用、复述或告诉她')
    expect(b.ids).toContain('old1')
    const long = Array.from({ length: 10 }, (_, i) => page(`l${i}`, '很长的一页'.repeat(60), i))
    const capped = buildDiaryBlock(long, '很长的一页', 850)
    expect(Array.from(capped.text).length).toBeLessThanOrEqual(850 + 2)
  })
  it('returns nothing when there is no diary', () => {
    expect(buildDiaryBlock([], '随便').text).toBe('')
  })
})
