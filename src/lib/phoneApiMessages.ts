import type { ChatApiMessage } from '@/api/chat'
import type { PhoneMsg } from '@/store/phoneStore'

export type ResolvePhoneImage = (src: string) => Promise<string>

export interface PhoneApiPayload {
  messages: ChatApiMessage[]
  hasActiveImage: boolean
}

/**
 * 把小手机消息整理成模型请求。
 *
 * 只有本轮刚发送（或正在重试）的图片保留真实图片内容；历史图片只留文字标记。
 * 否则会话里只要出现过一张图，后续每条纯文字都会永久走识图模型/浏览器直连。
 */
export async function buildPhoneApiPayload(
  history: PhoneMsg[],
  activeImageId: string | undefined,
  resolveImage: ResolvePhoneImage,
): Promise<PhoneApiPayload> {
  let activeImageUrl = ''
  if (activeImageId) {
    const activeImage = history.find((message) => message.id === activeImageId)?.image
    if (activeImage) activeImageUrl = await resolveImage(activeImage)
  }

  const messages: ChatApiMessage[] = history
    .filter((message) => message.text.trim() || message.image || message.sticker || message.task)
    .map((message) => {
      const role = message.role === 'me' ? ('user' as const) : ('assistant' as const)
      if (message.task) {
        const task = message.task
        let note = `（你给我下了任务：${task.text}，限时${task.minutes}分钟，我还在进行。）`
        if (task.status === 'done' && task.doneAt) {
          const used = Math.round((task.doneAt - task.startedAt) / 1000)
          const diff = Math.round((task.deadline - task.doneAt) / 1000)
          note = `（我完成了你下的任务：${task.text}，用时${used}秒，${diff >= 0 ? `提前${diff}秒` : `超时${-diff}秒`}。）`
        } else if (task.status === 'cancelled') {
          note = `（我取消了你下的任务：${task.text}。）`
        }
        return { role: 'user' as const, content: note }
      }
      if (message.image) {
        const text = message.text.trim()
        if (message.id !== activeImageId || !activeImageUrl) {
          const marker =
            message.id === activeImageId
              ? '［发送了一张图片，但图片已无法读取］'
              : '［之前发送了一张图片］'
          return { role, content: `${text}${text ? '\n' : ''}${marker}` }
        }
        const parts: Exclude<ChatApiMessage['content'], string> = []
        if (text) parts.push({ type: 'text', text })
        parts.push({ type: 'image_url', image_url: { url: activeImageUrl } })
        return { role, content: parts }
      }
      if (message.sticker) {
        return {
          role,
          content: `（发了一个表情贴纸：${message.sticker.name || message.sticker.emoji || '表情'}）`,
        }
      }
      return { role, content: message.text }
    })

  while (messages.length && messages[0].role !== 'user') messages.shift()

  return {
    messages,
    hasActiveImage: messages.some((message) => Array.isArray(message.content)),
  }
}

