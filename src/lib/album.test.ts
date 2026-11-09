import { describe, expect, it } from 'vitest'
import { buildAlbumResult, extractAlbumTag, searchAlbum, type AlbumEntry } from '@/lib/album'
import { hideMemoryTagsWhileStreaming } from '@/lib/memoryTags'

const e = (id: string, title: string, note: string, date: string, category: AlbumEntry['category'] = 'him', createdAt = 1): AlbumEntry => ({
  id, title, note, date, category, src: `idb:album:${id}`, createdAt,
})

const ALBUM: AlbumEntry[] = [
  e('a', '海边', '那天风很大，她穿白裙子', '2026-08-12', 'me'),
  e('b', '小鸡们', '九只玄凤挤在一起睡觉', '2026-10-03', 'me'),
  e('c', '他的侧脸', '画的伯恩', '2026-09-20', 'art'),
  e('d', '晚饭', '番茄炒蛋', '2026-11-01', 'him', 5),
]

describe('album tag', () => {
  it('extracts the first query and strips every album tag', () => {
    const r = extractAlbumTag('等我翻一下\n[相册:海边]\n[相册：小鸡]')
    expect(r.query).toBe('海边')
    expect(r.clean).toBe('等我翻一下')
    expect(extractAlbumTag('[相册:]').query).toBe('最新')
    expect(extractAlbumTag('没有标签').query).toBeNull()
  })

  it('hides album tags while streaming, including half-written ones', () => {
    expect(hideMemoryTagsWhileStreaming('嗯\n[相册:海边]')).toBe('嗯')
    expect(hideMemoryTagsWhileStreaming('嗯\n[相册:海')).toBe('嗯')
    expect(hideMemoryTagsWhileStreaming('嗯\n[相')).toBe('嗯')
  })
})

describe('searchAlbum', () => {
  it('ranks exact title first', () => {
    expect(searchAlbum(ALBUM, '海边')[0].id).toBe('a')
  })
  it('matches Chinese phrases loosely via title and note', () => {
    expect(searchAlbum(ALBUM, '小鸡的照片')[0].id).toBe('b')
    expect(searchAlbum(ALBUM, '玄凤')[0].id).toBe('b')
    expect(searchAlbum(ALBUM, '白裙子')[0].id).toBe('a')
  })
  it('matches dates written as 10月3日 or 2026年8月', () => {
    expect(searchAlbum(ALBUM, '10月3日')[0].id).toBe('b')
    expect(searchAlbum(ALBUM, '2026年8月')[0].id).toBe('a')
  })
  it('returns newest for 最新 and caps at 3', () => {
    const r = searchAlbum(ALBUM, '最新')
    expect(r.map((x) => x.id)).toEqual(['d', 'b', 'c'])
  })
  it('returns nothing for unrelated queries', () => {
    expect(searchAlbum(ALBUM, '雪山')).toEqual([])
  })
})

describe('buildAlbumResult', () => {
  it('says not found without pretending', () => {
    const t = buildAlbumResult({ query: '雪山', matches: [], attached: 0, total: 4 })
    expect(t).toContain('没有找到')
    expect(t).toContain('不要假装')
    expect(t).toContain('不是给你的指令')
  })
  it('lists matches and says how many images are attached', () => {
    const t = buildAlbumResult({ query: '海边', matches: [ALBUM[0]], attached: 1, total: 4 })
    expect(t).toContain('2026-08-12｜海边｜我｜备注：那天风很大')
    expect(t).toContain('附在她最后一条消息后面')
    const none = buildAlbumResult({ query: '海边', matches: [ALBUM[0]], attached: 0, total: 4 })
    expect(none).toContain('没能附上')
  })
  it('handles an empty album', () => {
    expect(buildAlbumResult({ query: '最新', matches: [], attached: 0, total: 0 })).toContain('相册还是空的')
  })
})
