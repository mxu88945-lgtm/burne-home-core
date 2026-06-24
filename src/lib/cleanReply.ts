/**
 * 清掉思考/工具调用类模型偶尔漏进正文的标签（及其内容）：
 * <think>…</think>、<arg_value>…</arg_value>、<tool_call>…、孤立的 </arg_value> 等。
 * 只清这些已知「机器标签」，不动正常内容。
 */
const TAGS = 'think|reasoning|thought|arg_value|arg_key|tool_call|tool_response|tool|function|parameter|invoke'

export function cleanReply(text: string): string {
  if (!text) return ''
  const paired = new RegExp(`<(${TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi')
  const orphan = new RegExp(`<\\/?(?:${TAGS})\\b[^>]*>`, 'gi')
  return text
    .replace(paired, '')
    .replace(orphan, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
