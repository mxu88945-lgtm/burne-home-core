/**
 * 角色卡「正则」脚本（SillyTavern regex_scripts 兼容）。
 * 卡里带的正则会在「展示时」把模型输出的原始文本替换成带样式的 HTML，
 * 实现对话上色、心理灰底、状态栏面板等美化。
 * 只做文本替换，产出的 HTML 由 SafeHtml 消毒后再渲染（防止不可信卡片偷本地数据）。
 */

export interface RegexScript {
  id: string
  name: string
  /** 正则本体（不含两侧斜杠） */
  find: string
  /** 正则 flags（g/i/m/s…） */
  flags: string
  /** 替换串，支持 $1..$9 / $& / {{match}} */
  replace: string
  /** 命中内容里要抹掉的子串（SillyTavern trimStrings） */
  trim: string[]
  /** 作用位置：1=用户输入 2=AI 输出（其余忽略） */
  placement: number[]
  disabled: boolean
  /** 只改喂给模型的 prompt（我们只做展示，故跳过这类） */
  promptOnly: boolean
}

function uid(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `rx-${Date.now()}-${Math.random()}`
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '')

/** "/body/flags" → {find,flags}；无斜杠则整体当 body，默认全局替换 */
function splitRegex(raw: string): { find: string; flags: string } {
  const m = raw.match(/^\/([\s\S]*)\/(\w*)$/)
  if (m) return { find: m[1], flags: m[2] || 'g' }
  return { find: raw, flags: 'g' }
}

/** 从卡的 extensions.regex_scripts 解析 */
export function parseRegexScripts(exts: unknown): RegexScript[] {
  const arr = exts && typeof exts === 'object' ? (exts as Record<string, unknown>).regex_scripts : null
  if (!Array.isArray(arr)) return []
  return arr
    .map((e): RegexScript => {
      const o = (e || {}) as Record<string, unknown>
      const { find, flags } = splitRegex(s(o.findRegex))
      return {
        id: uid(),
        name: s(o.scriptName) || '正则',
        find,
        flags,
        replace: s(o.replaceString),
        trim: Array.isArray(o.trimStrings) ? o.trimStrings.map(s).filter(Boolean) : [],
        placement: Array.isArray(o.placement) ? o.placement.map((n) => Number(n)) : [1, 2],
        disabled: o.disabled === true,
        promptOnly: o.promptOnly === true,
      }
    })
    .filter((r) => r.find)
}

/** 抹掉 trim 子串 */
function trimOut(text: string, trims: string[]): string {
  return trims.reduce((acc, t) => (t ? acc.split(t).join('') : acc), text)
}

/** 展开替换串里的 $1/$&/{{match}} */
function expand(tpl: string, match: string, groups: string[], trims: string[]): string {
  const T = (x: string) => trimOut(x, trims)
  return tpl
    .replace(/\{\{\s*match\s*\}\}/gi, () => T(match))
    .replace(/\$&/g, () => T(match))
    .replace(/\$(\d{1,2})/g, (_, d: string) => {
      const g = groups[Number(d) - 1]
      return g == null ? '' : T(String(g))
    })
}

/**
 * 对一条消息文本应用正则（展示用）。
 * isUser=true 用 placement 含 1 的脚本，否则用含 2 的脚本。
 */
export function applyRegexScripts(
  text: string,
  scripts: RegexScript[] | undefined,
  opts: { isUser: boolean },
): string {
  if (!scripts || !scripts.length) return text
  const want = opts.isUser ? 1 : 2
  let out = text
  for (const sc of scripts) {
    if (sc.disabled || sc.promptOnly) continue
    if (sc.placement.length && !sc.placement.includes(want)) continue
    let re: RegExp
    try {
      re = new RegExp(sc.find, sc.flags)
    } catch {
      continue // 非法正则跳过，不影响其它
    }
    try {
      out = out.replace(re, (...args) => {
        // args: match, p1..pn, offset, string, [namedGroups]
        const a = [...args]
        if (typeof a[a.length - 1] === 'object') a.pop() // named groups
        a.pop() // string
        a.pop() // offset
        const match = String(a[0] ?? '')
        const groups = a.slice(1).map((g) => (g == null ? '' : String(g)))
        return expand(sc.replace, match, groups, sc.trim)
      })
    } catch {
      /* 替换出错保留原文 */
    }
  }
  return out
}
