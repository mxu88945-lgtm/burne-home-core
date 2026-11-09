import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderRichText } from './richText'

describe('rich chat text semantics', () => {
  it('marks paragraphs, dialogue and stage narration without changing the words', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('第一段\n\n“欢迎回家。”\n（把你的手握住）')}</div>,
    )
    expect(html).toContain('bw-rich-line')
    expect(html).toContain('bw-rich-spacer')
    expect(html).toContain('bw-chat-quote')
    expect(html).toContain('bw-chat-narration')
    expect(html).toContain('欢迎回家。')
  })

  it('turns a line that is only dialogue into its own quote card, but keeps mixed lines inline', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('“你胆子肥了？”\n“周惟惟。”我低笑了一声')}</div>,
    )
    expect(html.match(/bw-quote-line/g)?.length).toBe(1)
    expect(html).toContain('我低笑了一声')
  })

  it('treats straight ASCII double quotes (Claude style) as dialogue too', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('"……江屹琛？"\n"顾祁砚……"我低声说')}</div>,
    )
    expect(html.match(/bw-quote-line/g)?.length).toBe(1)
    expect(html.match(/bw-chat-quote/g)?.length).toBe(2)
  })

  it('marks 「直角引号」 dialogue with a corner hook, leaving “” quotes unchanged', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('「别走。」他说，“我在。”\n**「加粗里的」**')}</div>,
    )
    expect(html.match(/bw-chat-quote--corner/g)?.length).toBe(2)
    expect(html).toContain('class="bw-chat-quote chat-quote">“我在。”')
  })

  it('keeps links clickable inside formatted paragraphs', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('资料：[OpenAI](https://openai.com)')}</div>,
    )
    expect(html).toContain('href="https://openai.com"')
    expect(html).toContain('OpenAI')
  })

  it('renders markdown bold, headings and rules instead of showing the symbols', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('手足无措——**这反差感，也太可爱了点。**\n---\n### 👑 小朋友\n他*轻轻笑*了')}</div>,
    )
    expect(html).not.toContain('**')
    expect(html).not.toContain('###')
    expect(html).not.toContain('---')
    expect(html).toContain('<strong class="bw-rich-strong">这反差感，也太可爱了点。</strong>')
    expect(html).toContain('bw-rich-hr')
    expect(html).toContain('bw-rich-heading')
    expect(html).toContain('<span class="bw-chat-narration chat-narration">轻轻笑</span>')
  })
})
