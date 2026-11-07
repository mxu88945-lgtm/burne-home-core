import { useRef, useState, type InputHTMLAttributes } from 'react'

/**
 * 密钥 / 密码输入框：右侧「显示 · 复制 · 清除」三个小胶囊（照顾祁砚）。其余用法同普通 input。
 * 清除走原生 setter + input 事件，受控组件的 onChange 也能收到。
 */
export default function PasswordInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function copy() {
    const v = ref.current?.value ?? ''
    if (!v) return
    try {
      await navigator.clipboard.writeText(v)
    } catch {
      // 老 iOS 兜底：选中后 execCommand
      const el = ref.current!
      const prev = el.type
      el.type = 'text'
      el.select()
      document.execCommand('copy')
      el.type = prev
      el.blur()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  function clear() {
    const el = ref.current
    if (!el || !el.value) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
  }

  const pill = 'rounded-full border border-line/70 bg-white/60 px-2 py-0.5 text-[11px] text-muted active:scale-95'
  return (
    <div className="relative">
      <input {...props} ref={ref} type={show ? 'text' : 'password'} className={className + ' pr-[8.5rem]'} />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <button type="button" onClick={() => setShow((s) => !s)} className={pill}>
          {show ? '隐藏' : '显示'}
        </button>
        <button type="button" onClick={() => void copy()} className={pill}>
          {copied ? '已复制' : '复制'}
        </button>
        <button type="button" onClick={clear} className={pill}>
          清除
        </button>
      </div>
    </div>
  )
}
