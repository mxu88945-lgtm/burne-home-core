#!/usr/bin/env node

/**
 * 把 ChatGPT 数据导出中的 conversations-*.json 转成可流式导入的独立档案包。
 *
 * 用法：
 *   npm run archive:build -- /path/to/export /path/to/burne-history.burne-archive.ndjson
 *
 * 原始导出只读；输出文件已被 .gitignore 排除，严禁提交私人对话。
 */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { once } from 'node:events'

const [inputArg, outputArg] = process.argv.slice(2)
if (!inputArg || !outputArg) {
  console.error('用法：npm run archive:build -- <ChatGPT导出目录> <输出.ndjson>')
  process.exit(1)
}

const inputDir = resolve(inputArg)
const outputPath = resolve(outputArg)
const names = (await readdir(inputDir))
  .filter((name) => /^conversations(?:-\d+)?\.json$/u.test(name))
  .sort()
if (!names.length) throw new Error('目录里没有 conversations-*.json')

const fileStats = await Promise.all(names.map((name) => stat(resolve(inputDir, name))))
const totalBytes = fileStats.reduce((sum, item) => sum + item.size, 0)
const fingerprint = createHash('sha256')
  .update(names.map((name, index) => `${name}:${fileStats[index].size}`).join('|'))
  .digest('hex')
  .slice(0, 16)
const sourceId = `chatgpt-${fingerprint}`
const createdAt = new Date().toISOString()

await mkdir(dirname(outputPath), { recursive: true })
const output = createWriteStream(outputPath, { encoding: 'utf8' })

async function writeLine(value) {
  // JSON 允许 U+2028/U+2029，但部分逐行读取器会把它们当换行；显式转义以保证一条记录永远只占一行。
  const line = JSON.stringify(value)
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
  if (!output.write(`${line}\n`)) await once(output, 'drain')
}

function iso(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const date = new Date(value * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function terms(value) {
  const text = normalize(value)
  const result = new Set(text.match(/[a-z0-9][a-z0-9._-]{1,}/gu) ?? [])
  for (const run of text.match(/[\u3400-\u9fff]+/gu) ?? []) {
    const chars = Array.from(run)
    for (let index = 0; index < chars.length - 1; index += 1) {
      result.add(`${chars[index]}${chars[index + 1]}`)
    }
  }
  return [...result]
}

function sample(values, max) {
  if (values.length <= max) return values
  const result = []
  const step = values.length / max
  for (let index = 0; index < max; index += 1) result.push(values[Math.floor(index * step)])
  return result
}

function indexTerms(title, text) {
  const fromTitle = terms(title)
  const titleSet = new Set(fromTitle)
  const fromBody = terms(text).filter((term) => !titleSet.has(term))
  return [...fromTitle, ...sample(fromBody, Math.max(0, 144 - fromTitle.length))].slice(0, 144)
}

function visibleText(message) {
  if (!message || !['user', 'assistant'].includes(message.author?.role)) return ''
  if (message.metadata?.is_visually_hidden_from_conversation) return ''
  if (message.metadata?.is_user_system_message) return ''
  if (message.recipient && message.recipient !== 'all') return ''
  const content = message.content
  if (!content || !['text', 'multimodal_text'].includes(content.content_type)) return ''
  return (Array.isArray(content.parts) ? content.parts : [])
    .filter((part) => typeof part === 'string')
    .join('\n')
    .trim()
}

function currentBranch(conversation) {
  const mapping = conversation.mapping ?? {}
  const rows = []
  const seen = new Set()
  let id = conversation.current_node
  while (id && mapping[id] && !seen.has(id)) {
    seen.add(id)
    const node = mapping[id]
    const text = visibleText(node.message)
    if (text) {
      rows.push({
        id: String(node.id ?? node.message?.id ?? id),
        role: node.message.author.role,
        text,
        at: iso(node.message.create_time),
      })
    }
    id = node.parent
  }
  return rows.reverse()
}

function burneMatch(title, messages) {
  const normalizedTitle = normalize(title)
  const body = normalize(messages.map((item) => item.text).join('\n'))
  const reasons = []
  let score = 0
  const strongTitle = /伯恩|burne|knox|诺克斯/u
  if (strongTitle.test(normalizedTitle)) {
    score += 85
    reasons.push('标题含伯恩关系锚点')
  }
  const exactAnchors = [
    ['伯恩·诺克斯', 55],
    ['burne knox', 55],
  ]
  for (const [anchor, points] of exactAnchors) {
    if (body.includes(anchor)) {
      score += points
      reasons.push(`原文含「${anchor}」`)
    }
  }
  const burneCount = (body.match(/伯恩/gu) ?? []).length
  if (burneCount) {
    score += Math.min(60, burneCount * 3)
    reasons.push(`伯恩出现 ${burneCount} 次`)
  }
  // 默认宁缺毋滥：低分会话仍完整入档，可在页面手动启用，但不会自动进主聊天。
  return { score, reasons: reasons.slice(0, 4), included: score >= 85 }
}

function makeChunks(conversationId, title, messages) {
  const chunks = []
  let lines = []
  let ids = []
  let startedAt
  let endedAt
  let chars = 0

  const flush = () => {
    if (!lines.length) return
    const text = lines.join('\n\n')
    chunks.push({
      id: `${conversationId}:chunk-${chunks.length + 1}`,
      conversationId,
      title,
      sequence: chunks.length + 1,
      startedAt,
      endedAt,
      text,
      messageIds: [...new Set(ids)],
      terms: indexTerms(title, text),
    })
    lines = []
    ids = []
    startedAt = undefined
    endedAt = undefined
    chars = 0
  }

  for (const message of messages) {
    const speaker = message.role === 'user' ? '用户原话' : '当时的助手原话'
    const rawLine = `${speaker}：${message.text}`
    const pieces = []
    for (let offset = 0; offset < rawLine.length; offset += 1800) {
      pieces.push(rawLine.slice(offset, offset + 1800))
    }
    for (const line of pieces) {
      if (lines.length && chars + line.length + 2 > 2400) flush()
      if (!startedAt) startedAt = message.at
      endedAt = message.at ?? endedAt
      lines.push(line)
      ids.push(message.id)
      chars += line.length + 2
    }
  }
  flush()
  return chunks
}

await writeLine({
  type: 'header',
  format: 'burne-memory-archive',
  version: 1,
  source: {
    id: sourceId,
    name: 'ChatGPT 历史导出',
    createdAt,
    originalFiles: names,
    bytes: totalBytes,
  },
})

let conversationCount = 0
let includedConversationCount = 0
let messageCount = 0
let chunkCount = 0
let firstMessageAt
let lastMessageAt

for (const [fileIndex, name] of names.entries()) {
  const raw = await readFile(resolve(inputDir, name), 'utf8')
  const conversations = JSON.parse(raw)
  if (!Array.isArray(conversations)) throw new Error(`${name} 不是会话数组`)
  for (const conversation of conversations) {
    const messages = currentBranch(conversation)
    if (!messages.length) continue
    const exportConversationId = String(conversation.id ?? `conversation-${conversationCount + 1}`)
    const conversationId = `${sourceId}:${exportConversationId}`
    const title = String(conversation.title ?? '未命名旧会话').trim() || '未命名旧会话'
    const chunks = makeChunks(conversationId, title, messages)
    const match = burneMatch(title, messages)
    const created = iso(conversation.create_time) ?? messages[0]?.at
    const updated = iso(conversation.update_time) ?? messages.at(-1)?.at
    await writeLine({
      type: 'conversation',
      conversation: {
        id: conversationId,
        sourceId,
        title,
        titleNormalized: normalize(title),
        createdAt: created,
        updatedAt: updated,
        messageCount: messages.length,
        chunkCount: chunks.length,
        burneScore: match.score,
        matchReasons: match.reasons,
        included: match.included,
      },
    })
    for (const chunk of chunks) {
      await writeLine({ type: 'chunk', chunk: { ...chunk, sourceId } })
    }
    conversationCount += 1
    includedConversationCount += Number(match.included)
    messageCount += messages.length
    chunkCount += chunks.length
    for (const message of messages) {
      if (!message.at) continue
      if (!firstMessageAt || message.at < firstMessageAt) firstMessageAt = message.at
      if (!lastMessageAt || message.at > lastMessageAt) lastMessageAt = message.at
    }
  }
  console.log(`已处理 ${fileIndex + 1}/${names.length}：${name}`)
}

await writeLine({
  type: 'end',
  stats: {
    conversationCount,
    includedConversationCount,
    messageCount,
    chunkCount,
    firstMessageAt,
    lastMessageAt,
  },
})
output.end()
await once(output, 'finish')
console.log(`完成：${outputPath}`)
console.log(`会话 ${conversationCount} · 已启用 ${includedConversationCount} · 消息 ${messageCount} · 切片 ${chunkCount}`)
