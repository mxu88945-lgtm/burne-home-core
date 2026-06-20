import { useState, type InputHTMLAttributes } from 'react'

/** 密码输入框：右侧 👁 点一下显示/隐藏明文。其余用法同普通 input。 */
export default function PasswordInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={className + ' pr-11'} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? '隐藏' : '显示'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-base text-muted active:scale-90"
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  )
}
