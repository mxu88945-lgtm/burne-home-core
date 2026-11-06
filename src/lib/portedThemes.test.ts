import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootUrl = new URL('../../', import.meta.url)

describe('顾祁砚主聊天主题移植', () => {
  it('keeps every active source theme available in the Burne picker', () => {
    const store = readFileSync(new URL('src/store/themeStore.ts', rootUrl), 'utf8')
    for (const id of [
      'claude', 'white', 'frostbubble', 'amberglow', 'liquidglass', 'paper',
      'scrapbook', 'academy', 'mobile', 'letter', 'mistnote', 'nightglow', 'vinyl',
    ]) {
      expect(store).toContain(`id: '${id}'`)
    }
  })

  it('scopes manuscript layouts to semantic main-chat classes', () => {
    const css = readFileSync(new URL('src/index.css', rootUrl), 'utf8')
    const chat = readFileSync(new URL('src/pages/Chat.tsx', rootUrl), 'utf8')

    expect(chat).toContain('bw-chat-messages')
    expect(chat).toContain('bw-message-bubble')
    expect(chat).toContain('bw-chat-composer')
    expect(css).toContain("[data-theme='paper'] .bw-message")
    expect(css).toContain("[data-theme='nightglow'] .bw-message-companion")
    expect(css).toContain("[data-theme='liquidglass'] .bw-chat-composer")
  })
})
