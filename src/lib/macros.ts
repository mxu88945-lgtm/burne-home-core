/**
 * 角色卡占位符替换（SillyTavern / Tavern 通用宏）。
 * 卡里的开场白/人设常写 {{user}}（＝你，女主）和 {{char}}（＝当前角色），
 * 不替换就会原样显示成 "{{user}}"。这里在「展示」和「喂给模型」两处都做替换。
 * 只做纯文本替换，安全无副作用。
 */

export interface MacroCtx {
  /** 用户名（女主）；替换 {{user}} */
  user?: string
  /** 当前角色名；替换 {{char}} */
  char?: string
}

/** 把文本里的 {{user}}/{{char}}（大小写不敏感）替换成实际名字 */
export function applyMacros(text: string, ctx: MacroCtx): string {
  if (!text || text.indexOf('{{') < 0) return text
  const user = (ctx.user || '').trim() || '我'
  const char = (ctx.char || '').trim() || '对方'
  return text
    .replace(/\{\{\s*user\s*\}\}/gi, user)
    .replace(/\{\{\s*char\s*\}\}/gi, char)
}
