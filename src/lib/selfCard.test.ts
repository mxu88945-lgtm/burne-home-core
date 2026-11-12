import { describe, expect, it } from 'vitest'
import {
  buildSelfCardPrompt,
  extractSelfCardTag,
  hideSelfCardWhileStreaming,
  normalizeSelfCard,
  normalizeSelfCardHistory,
  parseSelfCardTag,
  restoreSelfCard,
  selfCardSection,
  setSelfCardSection,
  stripSelfCardTags,
  SELF_CARD_HEADING,
  SELF_CARD_HISTORY_MAX,
  SELF_CARD_SECTION_MAX,
  SELF_CARD_SECTIONS,
  SELF_CARD_TOTAL_MAX,
  type SelfCardState,
} from './selfCard'
import { hideMemoryTagsWhileStreaming } from './memoryTags'
import { messagePromptText } from './contextCompression'
import { segmentSession } from './semanticSegments'

describe('自我卡标记解析', () => {
  it('取最后一个有效标记，括号 / 冒号 / 竖线全角半角都认', () => {
    expect(parseSelfCardTag('嗯。\n[自我卡:喜好|喜欢雨天，也喜欢她泡的茶]')).toEqual({ key: 'likes', content: '喜欢雨天，也喜欢她泡的茶' })
    expect(parseSelfCardTag('【自我卡：缺陷/小毛病｜嘴硬】')).toEqual({ key: 'flaws', content: '嘴硬' })
    expect(parseSelfCardTag('［自我卡：习惯|睡前看一眼她的消息\n周末早起］')?.content).toBe('睡前看一眼她的消息\n周末早起')
    expect(parseSelfCardTag('[自我卡:性格|A]\n[自我卡:其它|B]')).toEqual({ key: 'other', content: 'B' })
  })
  it('不认识的栏目、空内容不算', () => {
    expect(parseSelfCardTag('[自我卡:身份|总裁]')).toBeNull()
    expect(parseSelfCardTag('[自我卡:喜好|  ]')).toBeNull()
    expect(parseSelfCardTag('没有标记')).toBeNull()
    expect(selfCardSection('「小毛病」')).toBe('flaws')
  })
  it('能认 2000 字的整栏', () => {
    const long = '雨'.repeat(SELF_CARD_SECTION_MAX)
    expect(parseSelfCardTag(`好。\n[自我卡:喜好|${long}]`)?.content).toHaveLength(SELF_CARD_SECTION_MAX)
  })
  it('收尾时去掉所有标记（含无效的），点歌标记留给下一步', () => {
    const r = extractSelfCardTag('晚安。\n[自我卡:身份|总裁]\n[自我卡:喜好|喜欢她]\n[点歌:晴天]')
    expect(r.edit).toEqual({ key: 'likes', content: '喜欢她' })
    expect(r.clean).toBe('晚安。\n\n[点歌:晴天]')
    expect(extractSelfCardTag('普通 [括号]')).toEqual({ clean: '普通 [括号]', edit: null })
  })
  it('历史 / 显示文本里完整和写到一半的都去掉', () => {
    expect(stripSelfCardTags('晚安。\n[自我卡:喜好|喜欢她]')).toBe('晚安。')
    expect(stripSelfCardTags('晚安。\n【自我卡：喜好｜喜欢她说晚')).toBe('晚安。')
    expect(stripSelfCardTags('晚安。\n[自我卡:喜')).toBe('晚安。')
    expect(stripSelfCardTags('保留[括号]里的话')).toBe('保留[括号]里的话')
    expect(messagePromptText({ id: '1', role: 'companion', text: '好\n[自我卡:习惯|会等她先说晚安]', at: '' })).toBe('好')
  })
})

describe('流式时藏起自我卡标记', () => {
  it.each(['说完了\n[', '说完了\n[自', '说完了\n【自我', '说完了\n[自我卡', '说完了\n[自我卡:喜', '说完了\n［自我卡：喜好｜还没写完\n第二行'])('%s', (t) => {
    expect(hideSelfCardWhileStreaming(t).trim()).toBe('说完了')
    expect(hideMemoryTagsWhileStreaming(t)).toBe('说完了')
  })
  it('完整标记、和点歌混在一起也藏', () => {
    expect(hideMemoryTagsWhileStreaming('说完了\n[自我卡:喜好|雨天]')).toBe('说完了')
    expect(hideMemoryTagsWhileStreaming('说完了\n[点歌:晴天]\n[自我卡:喜好|雨')).toBe('说完了')
  })
})

describe('语义分段不带标记', () => {
  it('segmentSession 的文本里没有自我卡', () => {
    const session = {
      id: 's',
      title: 't',
      messages: [
        { id: 'a', role: 'me', text: '今天下雨了，你喜欢下雨吗', at: '' },
        { id: 'b', role: 'companion', text: '喜欢，和你一起的话。\n[自我卡:喜好|雨天]', at: '' },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segs = segmentSession(session as any, 'm', { includeTail: true })
    expect(JSON.stringify(segs)).not.toContain('自我卡')
  })
})

describe('自我卡数据', () => {
  it('8 栏；规范化：丢掉不认识的 key，每栏和总量封顶', () => {
    expect(SELF_CARD_SECTIONS).toHaveLength(8)
    const long = 'x'.repeat(2500)
    const card = normalizeSelfCard({ personality: long, likes: long, strengths: long, weaknesses: long, kinks: long, flaws: long, habits: long, other: long, identity: '总裁' })
    expect(card.personality).toHaveLength(SELF_CARD_SECTION_MAX)
    expect(Object.values(card).reduce((sum, item) => sum + (item?.length || 0), 0)).toBe(SELF_CARD_TOTAL_MAX)
    expect('identity' in card).toBe(false)
    expect(normalizeSelfCard('bad')).toEqual({})
    expect(normalizeSelfCardHistory('bad')).toEqual([])
  })
  it('历史（新的在末尾，最多 20 版）和恢复，恢复本身也能撤回', () => {
    let st: SelfCardState = { card: {}, history: [] }
    st = setSelfCardSection(st, 'likes', '雨天', '他改了「喜好」', 1)
    st = setSelfCardSection(st, 'likes', '雨天、茶', '他改了「喜好」', 2)
    expect(st.card).toEqual({ likes: '雨天、茶' })
    expect(st.history.map((item) => item.card)).toEqual([{}, { likes: '雨天' }])
    expect(setSelfCardSection(st, 'likes', ' 雨天、茶 ', 'x', 3)).toBe(st)
    st = restoreSelfCard(st, 1, 4)
    expect(st.card).toEqual({ likes: '雨天' })
    expect(st.history[st.history.length - 1]?.card).toEqual({ likes: '雨天、茶' })
    for (let i = 0; i < 30; i++) st = setSelfCardSection(st, 'habits', `习惯${i}`, 'x', 10 + i)
    expect(st.history).toHaveLength(SELF_CARD_HISTORY_MAX)
    st = setSelfCardSection(st, 'habits', '', '她改了「习惯」', 99)
    expect(st.card.habits).toBeUndefined()
  })
  it('单栏编辑截到 2000', () => {
    const st = setSelfCardSection({ card: {}, history: [] }, 'other', 'z'.repeat(2500), 'x')
    expect(st.card.other).toHaveLength(SELF_CARD_SECTION_MAX)
  })
})

describe('自我卡提示词', () => {
  it('只列填了的栏目；开关开着才教他改；用她的名字不写「用户」', () => {
    const text = buildSelfCardPrompt({ likes: '雨天' }, true, '惟惟')
    expect(text).toContain(SELF_CARD_HEADING)
    expect(text).toContain('【喜好】雨天')
    expect(text).not.toContain('【性格】')
    expect(text).toContain('[自我卡:栏目|')
    expect(text).toContain('惟惟')
    expect(text).not.toContain('用户')
    expect(text).not.toContain('{{user}}')
    expect(buildSelfCardPrompt({ likes: '雨天' }, false)).not.toContain('[自我卡:栏目|')
    expect(buildSelfCardPrompt({}, false)).toBe('')
  })
})
