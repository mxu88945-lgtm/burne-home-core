/**
 * 主题系统（Zustand）。
 *
 * 三个主题：暖粉 / 月光 / 暖夜。
 * 当前主题持久化到 localStorage，并写到 <html data-theme="..."> 上，
 * 具体配色由 index.css 里的 CSS 变量定义。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export type ThemeId = 'rose' | 'lavender' | 'night'

export interface ThemeMeta {
  id: ThemeId
  name: string
  emoji: string
  /** 主题切换器上的小圆点示意色 */
  dot: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'rose', name: '暖粉', emoji: '🌸', dot: '#d99bb0' },
  { id: 'lavender', name: '月光', emoji: '💜', dot: '#b39ddb' },
  { id: 'night', name: '暖夜', emoji: '🌙', dot: '#3a2f44' },
]

const DEFAULT_THEME: ThemeId = 'rose'

/** 各主题的顶部条颜色（状态栏 / theme-color），取页面顶部渐变色 */
export const BAR_COLORS: Record<ThemeId, string> = {
  rose: '#fdf3f5',
  lavender: '#f4f0fb',
  night: '#211a26',
}

function isThemeId(v: unknown): v is ThemeId {
  return v === 'rose' || v === 'lavender' || v === 'night'
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
