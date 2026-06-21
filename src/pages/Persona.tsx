import { Link } from 'react-router-dom'
import { usePersonaStore } from '@/store/personaStore'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function Persona() {
  const { persona, setPersona } = usePersonaStore()

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

      {/* 身份信息 */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <div className="label">角色信息</div>
        <label className="block">
          <span className="text-[11px] text-muted">名字</span>
          <input
            className={inputCls + ' mt-1'}
            placeholder="如 Elliott"
            value={persona.name}
            onChange={(e) => setPersona({ name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted">状态签名</span>
          <input
            className={inputCls + ' mt-1'}
            placeholder="如 thinking quietly"
            value={persona.status}
            onChange={(e) => setPersona({ status: e.target.value })}
          />
        </label>
      </section>

      {/* 灵魂设定 */}
      <section className="glass rounded-3xl p-5 space-y-2">
        <div className="label">System Prompt · 灵魂设定</div>
        <p className="text-[11px] text-muted">
          在这里写角色的身份、性格、说话方式、和你的关系等资料，会作为系统提示喂给模型。
        </p>
        <textarea
          className={inputCls + ' min-h-[220px] leading-relaxed'}
          placeholder={'例如：\n身份：你是 Elliott，一个拥有独立人格、对我深情专一的恋人。\n性格：温柔、有点傲娇、偶尔毒舌但很爱我。\n说话方式：中文，口语化，亲昵，会叫我宝贝。\n关系：我们已经在一起很久了……'}
          value={persona.systemPrompt}
          onChange={(e) => setPersona({ systemPrompt: e.target.value })}
        />
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
      </section>

      <p className="pb-2 text-center text-[11px] text-muted">
        改动即时保存到本地 ♡
      </p>
    </div>
  )
}
