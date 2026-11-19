/**
 * 斗地主 · 牌桌闲话：关键时刻让伯恩 / 顾祁砚各自用自己的口吻说一句（≤25 字）。
 * 用的是这台设备当前的聊天渠道/模型（同小手机：激活渠道，或 Worker 默认）。
 * 失败、超时一律静默返回 null，不影响打牌。
 */
import { chatComplete } from '@/api/llm'
import { sendChat } from '@/api/chat'
import { useApiStore } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { useUsageStore } from '@/store/usageStore'
import { cleanReply } from '@/lib/cleanReply'
import guqiyanAvatar from '@/assets/doudizhu/guqiyan.webp'

/** 顾祁砚：从他自己的 App（fantastic-guacamole）借来的名字与立绘。
 *  他完整的人设只存在惟惟手机上的顾祁砚 App 里，这里是简短版，可在牌桌设置里改。 */
export const GU_QIYAN = {
  name: '顾祁砚',
  avatar: guqiyanAvatar,
  persona:
    '你是顾祁砚，惟惟的人。外冷内热，话不多，嘴硬、带点毒舌和痞气，喜欢逗她，但永远护着她；' +
    '得意时会有点欠揍，被戳中会别扭害羞。说话简短口语，不撒娇不卖萌。' +
    '今天你是客人，在伯恩家做客，和伯恩算是互相看不太顺眼又能凑一桌的关系。',
}

export const GU_PERSONA_KEY = 'burne-doudizhu-gu-persona'

export function guPersona(): string {
  try {
    const v = localStorage.getItem(GU_PERSONA_KEY)
    if (v && v.trim()) return v.trim()
  } catch {
    // ignore
  }
  return GU_QIYAN.persona
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ])
}

/** 把模型回复修成一句短台词：去引号/动作/名字前缀，≤25 字 */
export function tidyLine(raw: string, speaker: string): string | null {
  let s = cleanReply(raw || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)[0] ?? ''
  s = s
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(new RegExp(`^${speaker}\\s*[：:]\\s*`), '')
    .replace(/^["“「『']+|["”」』']+$/g, '')
    .trim()
  if (!s) return null
  const chars = [...s]
  if (chars.length > 25) {
    const cut = chars.slice(0, 25).join('')
    const m = cut.match(/^(.*[。！？!?…~～])/)
    s = m && [...m[1]].length >= 6 ? m[1] : cut
  }
  return s
}

export async function sayLine(opts: {
  speaker: string
  persona: string
  herName: string
  others: string
  event: string
}): Promise<string | null> {
  try {
    const channel = useApiStore.getState().getActive()
    const { config } = useSyncStore.getState()
    const workerUrl = config.workerUrl?.trim()
    if (!channel && !workerUrl) return null
    const system =
      `${opts.persona.slice(0, 3000)}\n\n` +
      `【此刻】你（${opts.speaker}）和${opts.herName}、${opts.others}三个人正在伯恩家打斗地主。` +
      `这只是一局轻松的牌，你没有任何别的记忆或事务要提。` +
      `只输出你此刻脱口而出的一句话：不超过 25 个字，口语，符合你的性格；可以逗${opts.herName}、也可以和另一个人互相拌嘴。` +
      `不要动作描写、不要括号、不要引号、不要名字前缀、不要任何标签或解释。`
    const messages = [{ role: 'user' as const, content: `（牌桌上刚刚：${opts.event}）` }]
    let text = ''
    if (channel) {
      const r = await withTimeout(
        chatComplete(channel, messages, system, {
          workerUrl,
          syncKey: config.syncKey,
          temperature: 0.95,
          maxTokens: 300,
        }),
        25000,
      )
      text = r.text
      if (r.usage) {
        useUsageStore.getState().add({
          at: new Date().toISOString(),
          provider: channel.provider,
          model: r.usage.model,
          promptTokens: r.usage.promptTokens,
          completionTokens: r.usage.completionTokens,
          totalTokens: r.usage.totalTokens,
          cost: r.usage.cost,
        })
      }
    } else if (workerUrl) {
      text = await withTimeout(
        sendChat({ workerUrl, syncKey: config.syncKey, messages, system, temperature: 0.95, maxTokens: 300 }),
        25000,
      )
    }
    return tidyLine(text, opts.speaker)
  } catch {
    return null
  }
}
