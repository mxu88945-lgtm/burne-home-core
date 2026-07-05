/**
 * 主题系统（Zustand）。
 *
 * 三套玻璃拟态主题：黛绿 / 液态玻璃 / 素白。
 * 当前主题持久化到 localStorage，并写到 <html data-theme="..."> 上，
 * 具体配色由 index.css 里的 CSS 变量定义。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import sageBg from '@/assets/themes/sage-bg.jpg'

export type ThemeId = 'sage' | 'liquid' | 'ink'

export interface ThemeMeta {
  id: ThemeId
  name: string
  emoji: string
  desc: string
  /** 预览用的高级感配色（横条 / 圆点） */
  swatches: string[]
  /** 整屏背景壁纸（有图的主题，预览也显示这张图） */
  bgImage?: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'sage', name: '黛绿', emoji: '🍃', desc: '薄荷流光 · 玻璃泡泡', swatches: ['#E5E9F2', '#D7E8D5', '#C8D5DD', '#AFC7B4', '#96B3A2'], bgImage: sageBg },
  { id: 'liquid', name: '液态玻璃', emoji: '💧', desc: '深水绿幕 · 水滴折光', swatches: ['#0B1B18', '#183C34', '#3F6A60', '#7C8CF2', '#DDEBE5'] },
  { id: 'ink', name: '素白', emoji: '🤍', desc: '极简中性白 · 墨黑', swatches: ['#FFFFFF', '#F2F3F4', '#E7E9EA', '#C6C9CB', '#383A3C'] },
]

const DEFAULT_THEME: ThemeId = 'liquid'

/** 各主题的顶部条颜色（状态栏 / theme-color）。 */
export const BAR_COLORS: Record<ThemeId, string> = {
  sage: '#f4f1ec',
  liquid: '#10241f',
  ink: '#f4f1ec',
}

function isThemeId(v: unknown): v is ThemeId {
  return v === 'sage' || v === 'liquid' || v === 'ink'
}

/** 把主题写到 <html> 上，并同步 theme-color meta —— 启动时也会调用，避免闪烁。
 *  老版本保存过 aurora 的用户，会在读取时自动落回新的液态玻璃主题。
 */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  const color = BAR_COLORS[id]
  const old = document.querySelector('meta[name="theme-color"]')
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', color)
  if (old) old.replaceWith(meta)
  else document.head.appendChild(meta)
}

export function readStoredTheme(): ThemeId {
  const raw = readJSON<{ id?: string }>(STORAGE_KEYS.theme, {})
  return isThemeId(raw.id) ? raw.id : DEFAULT_THEME
}

interface ThemeState {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (id) => {
    writeJSON(STORAGE_KEYS.theme, { id })
    applyTheme(id)
    set({ theme: id })
  },
}))
