/**
 * Keep private-history recall separate from public web search.
 *
 * The private archive is resolved before the companion request is sent. When
 * the user explicitly asks about old chats/memories, sending the same turn to
 * OpenRouter's `:online` model only invites unrelated public search results.
 */

const PUBLIC_WEB_INTENT =
  /(?:公网|互联网上|网上|联网|网页|网站|新闻|搜索引擎|google|谷歌|百度|bing|维基|查资料|查官网)/iu

const PRIVATE_ARCHIVE_OBJECT =
  /(?:旧文|旧聊天|聊天记录|历史对话|以前的对话|过去的对话|原话|记忆库|记忆档案|旧日档案|私有库|本地库|数据库|跨窗口)/u

const PRIVATE_RECALL_ACTION =
  /(?:记得|回忆|想起|找回|召回|翻(?:一下|出来)?|查(?:一下|出来)?|搜(?:一下|出来)?|检索|以前|之前|上次|当时|那天|说过|聊过|提过)/u

/** True only for a request to inspect private conversation memory, not the web. */
export function isPrivateMemoryLookup(text: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || PUBLIC_WEB_INTENT.test(clean)) return false
  if (PRIVATE_ARCHIVE_OBJECT.test(clean)) return true
  return PRIVATE_RECALL_ACTION.test(clean) && /(?:我们|你|我|老公|老婆|那次|那件事|那句话)/u.test(clean)
}

export function buildMemoryRetrievalCapabilityNote(companionName: string): string {
  return (
    `\n\n【私有记忆召回能力与身份边界】\n` +
    `在你回复前，后台会依据最近双方对话、连续性资料和全局记忆，替${companionName}主动规划检索词，并从用户本地启用的旧日原文中找回证据；` +
    `因此不要声称“只能等用户明确报关键词”或“只能被动接收”。` +
    `你不能自由浏览整座数据库，也不要假装看见未注入的内容；只使用本轮实际提供的原文证据。` +
    `用户要求搜旧聊天、旧文、原话或私有记忆时，这是本地记忆检索，不是公网查询，不要拿网页资料回答。` +
    `所有证据必须严格按原文主语归属：用户讲述、历史助手输出、第三方角色台词和${companionName}本人的经历不是一回事。`
  )
}
