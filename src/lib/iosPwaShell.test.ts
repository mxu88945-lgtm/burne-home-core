import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootUrl = new URL('../../', import.meta.url)

describe('iPhone PWA full-screen shell', () => {
  it('uses a translucent status bar and restores only current theme ids before paint', () => {
    const html = readFileSync(new URL('index.html', rootUrl), 'utf8')

    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('apple-mobile-web-app-status-bar-style" content="black-translucent')
    expect(html).toContain("'frostbubble','amberglow','liquidglass'")
    expect(html).toContain("'paper','scrapbook','academy','mobile','letter','mistnote','nightglow','vinyl'")
    expect(html).not.toContain("id = 'liquid'")
    expect(html).not.toContain("liquid: '#10241f'")
  })

  it('pins theme and chat wallpaper layers to the standalone full-screen canvas', () => {
    const css = readFileSync(new URL('src/index.css', rootUrl), 'utf8')

    expect(css).toContain("html[data-standalone='true'] body")
    expect(css).toContain("html[data-standalone='true'] .app-bg")
    expect(css).toContain("html[data-standalone='true'] .chat-wallpaper-layer")
  })

  it('sizes the fixed App shell without a transform during keyboard interaction', () => {
    const layout = readFileSync(new URL('src/components/layout/AppLayout.tsx', rootUrl), 'utf8')

    expect(layout).toContain("top: 'var(--app-offset, 0px)'")
    expect(layout).toContain("height: 'var(--app-height, 100dvh)'")
    expect(layout).not.toContain("transform: 'translateY(var(--app-offset")
  })
})
