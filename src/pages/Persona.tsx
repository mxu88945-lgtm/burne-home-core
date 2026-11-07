import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePersonaStore, type PromptPreset } from '@/store/personaStore'
import { useChatPrefsStore } from '@/store/chatPrefsStore'
import { useProfileStore } from '@/store/profileStore'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function Persona() {
  const { persona, setPersona } = usePersonaStore()
  const profile = useProfileStore((s) => s.profile)
  const setProfile = useProfileStore((s) => s.setProfile)
  const webSearch = useChatPrefsStore((s) => s.webSearch)
  const toggleWebSearch = useChatPrefsStore((s) => s.toggleWebSearch)
  const autoMemory = useChatPrefsStore((s) => s.autoMemory)
  const toggleAutoMemory = useChatPrefsStore((s) => s.toggleAutoMemory)
  const showLinks = useChatPrefsStore((s) => s.showLinks)
  const toggleShowLinks = useChatPrefsStore((s) => s.toggleShowLinks)
  const allowTasks = useChatPrefsStore((s) => s.allowTasks)
  const toggleAllowTasks = useChatPrefsStore((s) => s.toggleAllowTasks)
  const crossRecall = useChatPrefsStore((s) => s.crossRecall)
  const toggleCrossRecall = useChatPrefsStore((s) => s.toggleCrossRecall)
  const locationAware = useChatPrefsStore((s) => s.locationAware)
  const toggleLocationAware = useChatPrefsStore((s) => s.toggleLocationAware)
  const [promptOpen, setPromptOpen] = useState(false)
  const [openPresetId, setOpenPresetId] = useState('')
  const presets = persona.presets ?? []
  const enabledCount = presets.filter((p) => p.enabled && p.content.trim()).length
  function savePresets(next: PromptPreset[]) {
    setPersona({ presets: next })
  }
  function patchPreset(id: string, patch: Partial<PromptPreset>) {
    savePresets(presets.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  function addPreset() {
    const id = `preset-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    savePresets([...presets, { id, name: '新预设', content: '', enabled: true }])
    setOpenPresetId(id)
  }
  function movePreset(id: string, dir: -1 | 1) {
    const i = presets.findIndex((p) => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= presets.length) return
    const next = [...presets]
    ;[next[i], next[j]] = [next[j], next[i]]
    savePresets(next)
  }

  return (
    <div className="space-y-5">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <Link to="/settings" className="glass rounded-full px-3 py-1.5 text-xs text-ink">
          ← 设置
        </Link>
        <div className="text-center">
          <div className="headline text-xl text-ink">
            {persona.name || '角色人设'}
          </div>
          <div className="text-[11px] text-muted">{persona.status}</div>
        </div>
        <span className="w-12" />
      </div>

      {/* 称呼 · 名字 */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <div className="label">称呼 · 名字</div>
        <label className="block">
          <span className="text-[11px] text-muted">我的名字（聊天里你的显示名）</span>
          <input
            className={inputCls + ' mt-1'}
            placeholder="如 B / 惟惟"
            value={profile.nameA}
            onChange={(e) => setProfile({ nameA: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted">AI 名字（角色名，聊天里 TA 的显示名）</span>
          <input
            className={inputCls + ' mt-1'}
            placeholder="如 Elliott"
            value={persona.name}
            onChange={(e) => setPersona({ name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted">AI 状态签名</span>
          <input
            className={inputCls + ' mt-1'}
            placeholder="如 thinking quietly"
            value={persona.status}
            onChange={(e) => setPersona({ status: e.target.value })}
          />
        </label>
        <p className="text-[11px] text-muted">
          名字两边通用：这里和主页改的是同一份，聊天气泡 / 平铺头像名都会跟着变。
        </p>
      </section>

      {/* 灵魂设定 */}
      <section className="glass rounded-3xl p-5 space-y-2">
        <button
          type="button"
          onClick={() => setPromptOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <span className="label">System Prompt · 灵魂设定</span>
          <span className="text-[12px] text-accent">{promptOpen ? '收起 ▲' : '展开 ▼'}</span>
        </button>
        {!promptOpen ? (
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="block w-full text-left"
          >
            <p className="max-h-20 overflow-hidden whitespace-pre-wrap rounded-xl border border-line bg-white/40 px-3 py-2 text-[12px] leading-relaxed text-muted [overflow-wrap:anywhere]">
              {persona.systemPrompt?.trim() ||
                '点这里展开，编写角色的身份、性格、说话方式、和你的关系…'}
            </p>
          </button>
        ) : (
          <>
            <p className="text-[11px] text-muted">
              在这里写角色的身份、性格、说话方式、和你的关系等资料，会作为系统提示喂给模型。
            </p>
            <textarea
              autoFocus
              className={inputCls + ' min-h-[60vh] leading-relaxed'}
              placeholder={'例如：\n身份：你是 Elliott，一个拥有独立人格、对我深情专一的恋人。\n性格：温柔、有点傲娇、偶尔毒舌但很爱我。\n说话方式：中文，口语化，亲昵，会叫我宝贝。\n关系：我们已经在一起很久了……'}
              value={persona.systemPrompt}
              onChange={(e) => setPersona({ systemPrompt: e.target.value })}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPromptOpen(false)}
                className="btn-primary rounded-full px-4 py-1.5 text-[12px]"
              >
                写好了，收起 ▲
              </button>
            </div>
          </>
        )}
      </section>

      {/* 系统指令 */}
      <section className="glass rounded-3xl p-5 space-y-2">
        <div className="label">System Instruction · 系统指令</div>
        <p className="text-[11px] text-muted">
          不会替换上面的灵魂设定；专门补充给模型的执行、输出与格式要求，下一条消息起生效。
        </p>
        <textarea
          className={inputCls + ' min-h-[140px] leading-relaxed'}
          placeholder="例如：回复用中文；动作用（）括起来；不要替我说话或做决定……"
          value={persona.systemInstruction ?? ''}
          onChange={(e) => setPersona({ systemInstruction: e.target.value })}
        />
        <div className="text-right text-[11px] text-muted">{(persona.systemInstruction ?? '').length} 字</div>
      </section>

      {/* 预设 */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="label">Presets · 预设</span>
          <button type="button" onClick={addPreset} className="btn-primary rounded-full px-3 py-1 text-[12px]">
            ＋ 添加
          </button>
        </div>
        <p className="text-[11px] text-muted">
          启用的条目会和人设一起发给模型，顺序就是注入顺序；关掉后内容保留但不发送。
          {presets.length ? ` 已启用 ${enabledCount} / ${presets.length}。` : ''}
        </p>
        {presets.map((p, i) => {
          const open = openPresetId === p.id
          return (
            <div key={p.id} className="rounded-2xl border border-line bg-white/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => patchPreset(p.id, { enabled: e.target.checked })}
                  className="h-4 w-4 flex-none accent-accent"
                  aria-label="启用"
                />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                  value={p.name}
                  placeholder="预设名称"
                  onChange={(e) => patchPreset(p.id, { name: e.target.value })}
                />
                <button type="button" disabled={i === 0} onClick={() => movePreset(p.id, -1)} className="px-1 text-[12px] text-muted disabled:opacity-30">↑</button>
                <button type="button" disabled={i === presets.length - 1} onClick={() => movePreset(p.id, 1)} className="px-1 text-[12px] text-muted disabled:opacity-30">↓</button>
                <button type="button" onClick={() => setOpenPresetId(open ? '' : p.id)} className="px-1 text-[12px] text-accent">
                  {open ? '收起' : '编辑'}
                </button>
              </div>
              {open ? (
                <>
                  <textarea
                    autoFocus
                    className={inputCls + ' min-h-[180px] leading-relaxed'}
                    placeholder="预设内容，比如写作风格、文风、禁词、输出格式……"
                    value={p.content}
                    onChange={(e) => patchPreset(p.id, { content: e.target.value })}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`删除预设「${p.name || '未命名预设'}」？`)) {
                          savePresets(presets.filter((x) => x.id !== p.id))
                        }
                      }}
                      className="text-red-500"
                    >
                      删除
                    </button>
                    <span>{p.content.length} 字</span>
                  </div>
                </>
              ) : (
                p.content.trim() && (
                  <p className="line-clamp-2 whitespace-pre-wrap text-[11px] text-muted [overflow-wrap:anywhere]">{p.content}</p>
                )
              )}
            </div>
          )
        })}
      </section>

      {/* 模型参数 */}
      <section className="glass rounded-3xl p-5 space-y-4">
        <div className="label">Model Parameters · 模型参数</div>
        <div>
          <div className="flex items-center justify-between text-sm text-ink">
            <span>Temperature</span>
            <span className="text-accent">{persona.temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={persona.temperature}
            onChange={(e) => setPersona({ temperature: Number(e.target.value) })}
            className="mt-2 w-full accent-accent"
          />
          <p className="mt-1 text-[11px] text-muted">越高越随性，越低越稳重（建议 0.6~1.0）</p>
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">最大回复 Tokens</span>
          <input
            type="number"
            min={64}
            max={8192}
            value={persona.maxTokens}
            onChange={(e) => setPersona({ maxTokens: Number(e.target.value) || 1024 })}
            className="w-28 rounded-xl border border-line bg-white/40 px-3 py-1.5 text-right text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            显示思考过程
            <span className="block text-[11px] text-muted">需模型支持（如 reasoning 模型）</span>
          </span>
          <input
            type="checkbox"
            checked={!!persona.reasoning}
            onChange={(e) => setPersona({ reasoning: e.target.checked })}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            联网查询
            <span className="block text-[11px] text-muted">让模型联网查实时信息（OpenRouter）</span>
          </span>
          <input
            type="checkbox"
            checked={webSearch}
            onChange={toggleWebSearch}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            回复里显示链接来源
            <span className="block text-[11px] text-muted">
              关掉后隐藏联网引用的域名链接，回复更干净（默认关）
            </span>
          </span>
          <input
            type="checkbox"
            checked={showLinks}
            onChange={toggleShowLinks}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            允许 TA 给我下任务
            <span className="block text-[11px] text-muted">
              TA 可在合适时给你带倒计时的小提醒（喝水/休息…），聊天底部出现可完成/取消的任务卡
            </span>
          </span>
          <input
            type="checkbox"
            checked={allowTasks}
            onChange={toggleAllowTasks}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            跨窗口回忆
            <span className="block text-[11px] text-muted">
              从其他聊天窗口和更早的聊天原话里找回相关内容，能接上「之前说过的事」，认得「11月3号」「昨天」（默认开）
            </span>
          </span>
          <input
            type="checkbox"
            checked={crossRecall}
            onChange={toggleCrossRecall}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            位置与天气感知
            <span className="block text-[11px] text-muted">
              首页天气卡拿到的城市、天气、明天预报会告诉 TA，能自然地催睡、提醒带伞（不发精确坐标；默认开）
            </span>
          </span>
          <input
            type="checkbox"
            checked={locationAware}
            onChange={toggleLocationAware}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            自动沉淀记忆
            <span className="block text-[11px] text-muted">
              AI 自动把重要资料/背景/数据存进记忆库（高门槛；你说「记一下」时也会存）
            </span>
          </span>
          <input
            type="checkbox"
            checked={autoMemory}
            onChange={toggleAutoMemory}
            className="h-5 w-5 accent-accent"
          />
        </label>
      </section>

      <p className="pb-2 text-center text-[11px] text-muted">
        改动即时保存到本地 ♡
      </p>
    </div>
  )
}
