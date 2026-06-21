import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePersonaStore } from '@/store/personaStore'
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
  const [promptOpen, setPromptOpen] = useState(false)

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
