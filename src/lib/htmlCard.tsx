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

  // 导航守卫 + Tavern 快捷回复：
  // srcDoc 沙箱继承父页(github.io)的 base URL，卡片里带相对地址的链接一旦跳转就整卡变成 GitHub Pages 404
  // （惟惟遇到的「点了直播卡的关注/送礼按钮就变成仓库页面」）。这些按钮其实是 Tavern 约定的
  // `<a href="/say 文本">`/`/send`——点了应当把「文本」当作用户消息发出去。于是：
  //  · `/say|/send 文本` → 拦掉跳转，postMessage 给父页由 DramaRoom 代发；
  //  · 其它会离开本卡的链接/表单/window.open → 一律拦掉（放行 # 锚点和 javascript:）。
  const guard =
    `<script>(function(){try{window.open=function(){return null}}catch(e){}` +
    `document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;` +
    `if(!a)return;var h=a.getAttribute('href')||'';var l=h.slice(0,11).toLowerCase();` +
    `if(h.charAt(0)==='#'||l==='javascript:')return;` +
    `var m=h.match(/^\\/(?:say|send)\\s+([\\s\\S]+)/i);` +
    `if(m){e.preventDefault();e.stopPropagation();try{parent.postMessage({__bwCardSay:m[1]},'*')}catch(x){}return}` +
    `e.preventDefault();e.stopPropagation()},true);` +
    `document.addEventListener('submit',function(e){e.preventDefault();e.stopPropagation()},true)})()<\/script>`

  // 去掉 meta 刷新跳转（<meta http-equiv="refresh" ...>）
  const cleaned = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '')

  const src = /<\/body>/i.test(cleaned)
    ? // 有完整 body：守卫脚本尽量早注入（body 开头或 head 内），reporter 收尾
      cleaned
        .replace(/(<body[^>]*>)/i, `$1${guard}`)
        .replace(/<\/body>/i, reporter + '</body>')
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>body{margin:0;padding:10px;font:14px/1.7 system-ui,-apple-system,sans-serif;color:#1f1f1f;word-break:break-word}img{max-width:100%}</style>` +
      `${guard}</head><body>${cleaned}${reporter}</body></html>`

  // 极少数卡片没有 <body> 标签却是完整 doc：兜底确保 guard 一定在（上面完整 body 分支已处理，这里补 head 无 body 的情况）
  const finalSrc = src.includes(guard) ? src : src.replace(/<head[^>]*>/i, (m) => m + guard)

  return (
    <iframe
      title="card"
      sandbox="allow-scripts allow-popups"
      allow="autoplay"
      srcDoc={finalSrc}
      scrolling="no"
      className="my-1 w-full rounded-xl border border-line/40 bg-white"
      style={{ height: h }}
    />
  )
}
