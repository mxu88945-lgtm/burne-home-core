/**
 * TA 给的小任务/提醒（Zustand，本地持久化）。
 * 模型可在回复里下任务，带倒计时；本地存，完成/取消由你点。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface ChatTask {
  id: string
  text: string
  minutes: number
  /** 截止时间戳（ms） */
  deadline: number
  status: 'active' | 'done' | 'cancelled'
  createdAt: number
}

function uid() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random()}`
}

interface TaskState {
  tasks: ChatTask[]
  addTask: (text: string, minutes: number) => void
  complete: (id: string) => void
  cancel: (id: string) => void
}

const init = readJSON<ChatTask[]>(STORAGE_KEYS.tasks, [])

function persist(tasks: ChatTask[]) {
  writeJSON(STORAGE_KEYS.tasks, tasks)
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: Array.isArray(init) ? init : [],

  addTask: (text, minutes) => {
    const m = Math.max(1, Math.min(180, Math.round(minutes) || 5))
    const task: ChatTask = {
      id: uid(),
      text: text.trim(),
      minutes: m,
      deadline: Date.now() + m * 60000,
      status: 'active',
      createdAt: Date.now(),
    }
    // 只保留最近 30 条，避免无限增长
    const tasks = [...get().tasks, task].slice(-30)
    persist(tasks)
    set({ tasks })
  },

  complete: (id) => {
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, status: 'done' as const } : t))
    persist(tasks)
    set({ tasks })
  },

  cancel: (id) => {
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, status: 'cancelled' as const } : t))
    persist(tasks)
    set({ tasks })
  },
}))

/** 从模型回复里解析任务标记 [[task|分钟|内容]]，返回任务数组与去掉标记后的文本 */
export function parseTasks(text: string): { tasks: { text: string; minutes: number }[]; clean: string } {
  const re = /\[\[task\|(\d+)\|([^\]]+)\]\]/g
  const tasks: { text: string; minutes: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    tasks.push({ minutes: Number(m[1]), text: m[2].trim() })
  }
  const clean = text.replace(re, '').replace(/\n{3,}/g, '\n\n').trim()
  return { tasks, clean }
}
