/**
 * 任务卡的结果要「排在最后」告诉他。
 * 任务卡停在它下达时的位置；她中途又聊了几句后再点完成/取消，结果若只在原位改写，
 * 模型看到的是一段旧历史，最后一条还是他自己的回复，于是像没收到一样。
 * 这里：完成/取消发生在之后所有消息之后 → 原位只写「下了任务」，结果另起一条放到末尾。
 */
export interface TaskLike {
  text: string
  minutes: number
  startedAt: number
  deadline: number
  status: 'active' | 'done' | 'cancelled'
  doneAt?: number
  cancelledAt?: number
}
export interface TaskMsgLike {
  id: string
  ts?: number
  task?: TaskLike
}

export function taskAssignedNote(tk: TaskLike): string {
  return `（你给我下了任务：${tk.text}，限时${tk.minutes}分钟。）`
}

export function taskResultNote(tk: TaskLike): string {
  if (tk.status === 'done' && tk.doneAt) {
    const used = Math.round((tk.doneAt - tk.startedAt) / 1000)
    const diff = Math.round((tk.deadline - tk.doneAt) / 1000)
    return `（我完成了你下的任务：${tk.text}，用时${used}秒，${diff >= 0 ? `提前${diff}秒` : `超时${-diff}秒`}。）`
  }
  if (tk.status === 'cancelled') return `（我取消了你下的任务：${tk.text}。）`
  return `（你给我下了任务：${tk.text}，限时${tk.minutes}分钟，我还在进行。）`
}

/** 返回需要「挪到末尾汇报」的任务消息 id（按结束时间先后） */
export function lateTaskReports(history: TaskMsgLike[]): string[] {
  const out: { id: string; end: number }[] = []
  history.forEach((m, i) => {
    const tk = m.task
    if (!tk || tk.status === 'active') return
    const end = tk.status === 'done' ? tk.doneAt : tk.cancelledAt
    if (!end) return
    const later = history.slice(i + 1)
    if (!later.length) return
    // 结束之后已经有新消息 → 早就汇报过了，原位保留结果即可
    if (later.some((x) => !x.ts || x.ts >= end)) return
    out.push({ id: m.id, end })
  })
  return out.sort((a, b) => a.end - b.end).map((x) => x.id)
}
