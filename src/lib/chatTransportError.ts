type ChatLikeMessage = { role: 'me' | 'companion'; text: string }

export function isFailedTransportMessage(message: ChatLikeMessage): boolean {
  if (message.role !== 'companion') return false
  return /^\s*[（(]?\s*消息没送到\s*[：:]?[\s\S]*(?:requires\s+more\s+credits|fewer\s+max_tokens|HTTP\s+4\d\d|HTTP\s+5\d\d)/i.test(
    message.text,
  )
}
