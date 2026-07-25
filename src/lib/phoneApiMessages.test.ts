import { describe, expect, it, vi } from 'vitest'
import type { PhoneMsg } from '@/store/phoneStore'
import { buildPhoneApiPayload } from '@/lib/phoneApiMessages'

const at = '12:00'

describe('buildPhoneApiPayload', () => {
  it('does not resend historical images with later text messages', async () => {
    const history: PhoneMsg[] = [
      { id: 'image', role: 'me', text: '看看这个', at, image: 'idb:pimg:image' },
      { id: 'reply', role: 'ta', text: '看到了', at },
      { id: 'text', role: 'me', text: '继续聊', at },
    ]
    const resolveImage = vi.fn(async () => 'data:image/jpeg;base64,old')

    const payload = await buildPhoneApiPayload(history, undefined, resolveImage)

    expect(resolveImage).not.toHaveBeenCalled()
    expect(payload.hasActiveImage).toBe(false)
    expect(payload.messages).toEqual([
      { role: 'user', content: '看看这个\n［之前发送了一张图片］' },
      { role: 'assistant', content: '看到了' },
      { role: 'user', content: '继续聊' },
    ])
  })

  it('sends only the image from the active turn', async () => {
    const history: PhoneMsg[] = [
      { id: 'old', role: 'me', text: '', at, image: 'idb:pimg:old' },
      { id: 'reply', role: 'ta', text: '旧图收到', at },
      { id: 'new', role: 'me', text: '新图', at, image: 'idb:pimg:new' },
    ]
    const resolveImage = vi.fn(async (src: string) =>
      src.endsWith('new') ? 'data:image/jpeg;base64,new' : 'data:image/jpeg;base64,old',
    )

    const payload = await buildPhoneApiPayload(history, 'new', resolveImage)

    expect(resolveImage).toHaveBeenCalledOnce()
    expect(resolveImage).toHaveBeenCalledWith('idb:pimg:new')
    expect(payload.hasActiveImage).toBe(true)
    expect(payload.messages[0]).toEqual({ role: 'user', content: '［之前发送了一张图片］' })
    expect(payload.messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '新图' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,new' } },
      ],
    })
  })

  it('falls back to text when the active image body is missing', async () => {
    const history: PhoneMsg[] = [
      { id: 'missing', role: 'me', text: '这张图', at, image: 'idb:pimg:missing' },
    ]

    const payload = await buildPhoneApiPayload(history, 'missing', async () => '')

    expect(payload.hasActiveImage).toBe(false)
    expect(payload.messages).toEqual([
      { role: 'user', content: '这张图\n［发送了一张图片，但图片已无法读取］' },
    ])
  })
})

