/**
 * 主题系统（Zustand）。
 *
 * 伯恩主屋主题 + 从顾祁砚主聊天移植的主题。
 * 当前主题持久化到 localStorage，并写到 <html data-theme="..."> 上，
 * 具体配色由 index.css 里的 CSS 变量定义。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import sageBg from '@/assets/themes/sage-bg.jpg'
import plushBg from '@/assets/themes/plush-bg'

export type ThemeId =
  | 'sage' | 'plush' | 'aurora' | 'ink'
  | 'claude' | 'white' | 'frostbubble' | 'amberglow' | 'liquidglass'
  | 'paper' | 'scrapbook' | 'academy' | 'mobile' | 'letter' | 'mistnote'
  | 'nightglow' | 'vinyl'

export interface ThemeMeta {
  id: Exclude<ThemeId, 'aurora'>
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
  { id: 'plush', name: '毛玻璃', emoji: '🫧', desc: '软白玩偶 · 轻雾玻璃', swatches: ['#FCFAF7', '#F2EEE8', '#E4EAF0', '#D9D1C6', '#B6A897'], bgImage: plushBg },
  { id: 'ink', name: '素白', emoji: '🤍', desc: '极简中性白 · 墨黑', swatches: ['#FFFFFF', '#F2F3F4', '#E7E9EA', '#C6C9CB', '#383A3C'] },
  { id: 'claude', name: 'Claude 官端', emoji: '◌', desc: '暖纸画布 · 平铺正文', swatches: ['#f8f8f6', '#eeeeec', '#deddd8', '#d97757', '#292826'] },
  { id: 'white', name: '极简白', emoji: '□', desc: '纯白留白 · 清爽对话', swatches: ['#ffffff', '#f7f7f7', '#eaeaea', '#5d63e6', '#111111'] },
  { id: 'frostbubble', name: '磨砂气泡', emoji: '❍', desc: '冷白紫灰 · 雾面玻璃', swatches: ['#fbfbfd', '#f0eef7', '#e8ebf2', '#8d83b5', '#2e2d33'] },
  { id: 'amberglow', name: '暖光琥珀', emoji: '◐', desc: '深夜暖光 · 琥珀玻璃', swatches: ['#241810', '#3a271b', '#6a4a30', '#e8a35a', '#f6e7d4'] },
  { id: 'liquidglass', name: '顾祁砚·液态', emoji: '◒', desc: '奶油液态 · 柔光折射', swatches: ['#fbfaf5', '#eee9de', '#d8d0c2', '#737766', '#34352f'] },
  { id: 'paper', name: '雾蓝纸笺', emoji: '▤', desc: '雾蓝横线 · 纸笺正文', swatches: ['#edf2f5', '#f8fafb', '#cedce5', '#617e91', '#3e4c57'] },
  { id: 'scrapbook', name: '莓红剪贴簿', emoji: '✿', desc: '奶油纸页 · 莓红相框', swatches: ['#faf8f4', '#fffaf5', '#d7aaa2', '#974847', '#503b37'] },
  { id: 'academy', name: '秋日批注', emoji: '✎', desc: '书页米白 · 暗红批注', swatches: ['#fafaf6', '#fffffa', '#ded9ca', '#9d343d', '#272a29'] },
  { id: 'mobile', name: '白笺通讯', emoji: '◫', desc: '轻盈白笺 · 通讯气泡', swatches: ['#fafafc', '#f8fbfc', '#e8e8ed', '#777781', '#242429'] },
  { id: 'letter', name: '雾白来信', emoji: '✉', desc: '雾白信纸 · 蓝灰墨迹', swatches: ['#f3f1ed', '#faf9f6', '#d9dde0', '#6f8290', '#34383d'] },
  { id: 'mistnote', name: '雾蓝长笺', emoji: '≋', desc: '长笺卡片 · 雾蓝对白', swatches: ['#f3f6f7', '#fbfcfc', '#cbd7de', '#647d8d', '#35424b'] },
  { id: 'nightglow', name: '暗夜流光', emoji: '◉', desc: '暖灰纸面 · 暗红流光', swatches: ['#f6f1ee', '#faf7f4', '#e8dfd8', '#a8383c', '#2b2522'] },
  { id: 'vinyl', name: '青橙唱片', emoji: '●', desc: '清透青灰 · 唱片橙光', swatches: ['#ffffff', '#f8fbfc', '#c8d9df', '#416978', '#d98b52'] },
]

const DEFAULT_THEME: ThemeId = 'plush'

/** 各主题的顶部条颜色（状态栏 / theme-color）。 */
export const BAR_COLORS: Record<ThemeId, string> = {
  sage: '#f4f1ec',
  plush: '#f4f1ec',
  aurora: '#f4f1ec',
  ink: '#f4f1ec',
  claude: '#f8f8f6',
  white: '#ffffff',
  frostbubble: '#fbfbfd',
  amberglow: '#3a271b',
  liquidglass: '#faf8f2',
  paper: '#edf2f5',
  scrapbook: '#faf8f4',
  academy: '#fafaf6',
  mobile: '#fafafc',
  letter: '#f3f1ed',
  mistnote: '#f3f6f7',
  nightglow: '#f6f1ee',
  vinyl: '#ffffff',
}

function normalizeThemeId(v: unknown): ThemeId | null {
  if (THEMES.some((theme) => theme.id === v)) return v as ThemeId
  if (v === 'aurora' || v === 'liquid') return 'plush'
  return null
}

/** 把主题写到 <html> 上，并同步 theme-color meta —— 启动时也会调用，避免闪烁。 */
export function applyTheme(id: ThemeId) {
  const actualId = id === 'aurora' ? 'plush' : id
  document.documentElement.dataset.theme = actualId
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
  const id = normalizeThemeId(raw.id)
  return id ?? DEFAULT_THEME
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
