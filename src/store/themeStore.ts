/**
 * 主题系统（Zustand）。
 *
 * 四套玻璃拟态主题：雾粉 / 黛绿 / 琉璃 / 暮夜。
 * 当前主题持久化到 localStorage，并写到 <html data-theme="..."> 上，
 * 具体配色由 index.css 里的 CSS 变量定义。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export type ThemeId = 'mist' | 'sage' | 'aurora' | 'dusk' | 'ink'

export interface ThemeMeta {
  id: ThemeId
  name: string
  emoji: string
  desc: string
  /** 预览用的高级感配色（横条 / 圆点） */
  swatches: string[]
}

export const THEMES: ThemeMeta[] = [
  { id: 'mist', name: '雾粉', emoji: '🌸', desc: '雾系奶粉 · 一点黛灰', swatches: ['#F2F4F1', '#EBD5D0', '#E4C5C1', '#CED8CF', '#CCCCC0'] },
  { id: 'sage', name: '黛绿', emoji: '🍃', desc: '雾感灰绿 · 蓝灰', swatches: ['#E5E9F2', '#D7E8D5', '#C8D5DD', '#AFC7B4', '#96B3A2'] },
  { id: 'aurora', name: '琉璃', emoji: '🫧', desc: '全息流光玻璃', swatches: ['#E9D9F3', '#D4E8EE', '#F0DCE8', '#DFE6F5', '#B7A6E4'] },
  { id: 'dusk', name: '暮夜', emoji: '🌙', desc: '暖调深棕 · 金', swatches: ['#36302E', '#5A4B40', '#D6AB86', '#E7C8A9', '#2C2724'] },
  { id: 'ink', name: '素白', emoji: '🤍', desc: '极简中性白 · 墨黑', swatches: ['#FFFFFF', '#F2F3F4', '#E7E9EA', '#C6C9CB', '#383A3C'] },
]

const DEFAULT_THEME: ThemeId = 'mist'

/** 各主题的顶部条颜色（状态栏 / theme-color），取页面顶部色 */
export const BAR_COLORS: Record<ThemeId, string> = {
  mist: '#f6ebe8',
  sage: '#e9f0ec',
  aurora: '#eceaf4',
  dusk: '#2c2724',
  ink: '#f2f3f4',
}

function isThemeId(v: unknown): v is ThemeId {
  return v === 'mist' || v === 'sage' || v === 'aurora' || v === 'dusk' || v === 'ink'
}

/** 把主题写到 <html> 上，并同步 theme-color meta —— 启动时也会调用，避免闪烁 */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BAR_COLORS[id])
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
