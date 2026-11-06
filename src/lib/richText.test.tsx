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

  it('keeps links clickable inside formatted paragraphs', () => {
    const html = renderToStaticMarkup(
      <div>{renderRichText('资料：[OpenAI](https://openai.com)')}</div>,
    )
    expect(html).toContain('href="https://openai.com"')
    expect(html).toContain('OpenAI')
  })
})
