/**
 * 把「整页 HTML」的角色卡内容（开场白/消息里带 <style>/<div> 布局、内置音乐等）
 * 用沙箱 iframe 真渲染出来——带它自己的 CSS，但隔离在独立来源里（拿不到本站 DOM / 存储）。
 * iframe 高度由内部脚本上报、自动撑开。
 */

import { useEffect, useRef, useState } from 'react'

let seq = 0

/** 是否是「整页 HTML」卡片内容（需要 iframe 渲染） */
export function isRichHtml(t: string): boolean {
  return /(<!doctype|<html[\s>]|<style[\s>]|<div[\s>]|<table[\s>])/i.test(t)
}

export function HtmlCard({ html }: { html: string }) {
  const idRef = useRef('')
  if (!idRef.current) idRef.current = `hc${seq++}_${Math.random().toString(36).slice(2)}`
  const id = idRef.current
  const [h, setH] = useState(160)

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { __cardId?: string; h?: number }
      if (d && d.__cardId === id && typeof d.h === 'number') {
        setH(Math.min(3000, Math.max(48, Math.ceil(d.h))))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [id])

  // 上报高度的小脚本（在沙箱里跑，只能 postMessage 出来）
  const reporter =
    `<script>(function(){function r(){try{var b=document.body,e=document.documentElement;` +
    `var hh=Math.max(b?b.scrollHeight:0,e?e.scrollHeight:0,b?b.offsetHeight:0);` +
    `parent.postMessage({__cardId:${JSON.stringify(id)},h:hh},'*')}catch(x){}}` +
    `window.addEventListener('load',r);setTimeout(r,120);setTimeout(r,500);setTimeout(r,1500);` +
    `try{if(window.ResizeObserver)new ResizeObserver(r).observe(document.documentElement)}catch(x){}` +
    `document.addEventListener('click',function(){setTimeout(r,60);setTimeout(r,360)});})()<\/script>`

  const src = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, reporter + '</body>')
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>body{margin:0;padding:10px;font:14px/1.7 system-ui,-apple-system,sans-serif;color:#1f1f1f;word-break:break-word}img{max-width:100%}</style>` +
      `</head><body>${html}${reporter}</body></html>`

  return (
    <iframe
      title="card"
      sandbox="allow-scripts allow-popups"
      allow="autoplay"
      srcDoc={src}
      scrolling="no"
      className="my-1 w-full rounded-xl border border-line/40 bg-white"
      style={{ height: h }}
    />
  )
}
