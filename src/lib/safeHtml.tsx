/**
 * 行内/块级富文本渲染：把（正则产出的）带样式 HTML 消毒后就地渲染。
 * 支持对话上色 <span style="color">、心理灰底、<details> 折叠状态栏等。
 * 安全：DOMPurify 白名单——只留展示类标签/属性，script 标签、on 事件、javascript 协议全部剔除，
 * 所以不可信卡片无法读取本页 localStorage（里面有 API key）。
 */

import { useMemo } from 'react'
import DOMPurify from 'dompurify'

/** 展示类标签白名单（不含 script/style/iframe/object 等） */
const ALLOWED_TAGS = [
  'span', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'br', 'p', 'div', 'section', 'blockquote', 'hr', 'font',
  'details', 'summary', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'code', 'pre', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]
const ALLOWED_ATTR = ['style', 'class', 'color', 'align', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'open', 'colspan', 'rowspan']

/** 判断是否包含展示类内联/块级 HTML 标签 */
export function hasInlineHtml(s: string): boolean {
  return /<(span|details|summary|mark|font|b|strong|i|em|u|s|div|p|ul|ol|li|h[1-6]|blockquote|a|small|sub|sup|table)\b[^>]*>/i.test(s)
}

/** 整段 HTML 文档级标记（重量级）→ 交给沙箱 iframe，而非就地渲染 */
export function isFullHtmlDoc(s: string): boolean {
  return /(<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]|<script[\s>])/i.test(s)
}

export function SafeHtml({ html }: { html: string }) {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick'],
      }),
    [html],
  )
  return (
    <div
      className="drama-safe whitespace-pre-wrap [overflow-wrap:anywhere] [&_a]:text-accent [&_a]:underline [&_details]:my-1.5 [&_details]:overflow-hidden [&_details]:rounded-xl [&_details]:bg-black/[0.06] [&_details]:px-3 [&_details]:py-1.5 [&_details]:whitespace-normal [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:py-0.5 [&_summary]:text-[12px] [&_summary]:text-muted [&_table]:my-1 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-0.5 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-0.5"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
