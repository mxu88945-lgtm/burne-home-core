import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootUrl = new URL('../../', import.meta.url)

describe('顾祁砚主聊天主题移植', () => {
  it('keeps every active source theme available in the Burne picker', () => {
    const store = readFileSync(new URL('src/store/themeStore.ts', rootUrl), 'utf8')
    for (const id of [
      'claude', 'white', 'liquidglass', 'paper',
      'scrapbook', 'academy', 'mobile', 'letter', 'mistnote', 'nightglow', 'vinyl', 'pudding',
    ]) {
      expect(store).toContain(`id: '${id}'`)
    }
  })

  it('scopes manuscript layouts to semantic main-chat classes', () => {
    const css = readFileSync(new URL('src/index.css', rootUrl), 'utf8')
    const archives = readFileSync(new URL('src/themeArchives.css', rootUrl), 'utf8')
    const chat = readFileSync(new URL('src/pages/Chat.tsx', rootUrl), 'utf8')

    expect(chat).toContain('bw-chat-messages')
    expect(chat).toContain('bw-message-bubble')
    expect(chat).toContain('bw-chat-composer')
    expect(chat).toContain('bw-shell-message')
    expect(chat).toContain('ThemeMessageHeading')
    expect(chat).toContain('bw-message-content')
    expect(css).toContain("[data-theme='paper'] .bw-message")
    expect(css).toContain("[data-theme='nightglow'] .bw-message-companion")
    expect(css).toContain("[data-theme='liquidglass'] .bw-chat-composer")
    expect(css).toContain("[data-theme='letter'] .bw-shell-letter")
    expect(css).toContain("[data-theme='vinyl'] .bw-shell-vinyl")
    expect(css).toContain('.bw-chat-quote')
    expect(archives).toContain('.archive-row.archive-pudding')
    expect(archives).toContain('.archive-pudding .pudding-capsule')
    expect(archives).toContain('.archive-pudding.user .pudding-avatar')
    expect(archives).toContain('.archive-pudding .pudding-letter-top')
    expect(archives).toContain('POMPOMPURIN · SWEET LITTLE MESSAGE ♡')
    expect(chat).toContain('pudding-dog.svg')
    expect(chat).not.toContain('pudding-bone')
    expect(chat).toContain('import.meta.env.BASE_URL')
    expect(chat).not.toContain('ﻌ')
    expect(existsSync(new URL('public/pudding-dog.svg', rootUrl))).toBe(true)
    expect(existsSync(new URL('public/pudding-bone.svg', rootUrl))).toBe(false)
    expect(archives).toContain('-webkit-line-clamp: 2')
  })

  it('adds 暖茶笺 as a selectable theme without touching the default', () => {
    const store = readFileSync(new URL('src/store/themeStore.ts', rootUrl), 'utf8')
    const css = readFileSync(new URL('src/index.css', rootUrl), 'utf8')
    expect(store).toContain("id: 'warmtea', name: '暖茶笺'")
    expect(store).toContain("warmtea: '#FBF4EA'")
    expect(store).toContain("const DEFAULT_THEME: ThemeId = 'claude'")
    expect(store).toContain("id: 'pudding'")
    expect(css).toContain("[data-theme='warmtea'] {")
    expect(css).toContain("[data-theme='warmtea'] .bw-chat-messages .bw-chat-quote.bw-chat-quote--corner")
    expect(css).toContain("[data-theme='warmtea'] .bw-message-avatar")
  })
})
