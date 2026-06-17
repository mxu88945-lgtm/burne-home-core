/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 语义色，全部指向 index.css 里的 CSS 变量（随主题切换）
        ink: 'var(--text)',
        muted: 'var(--text-soft)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        line: 'var(--card-border)',
        label: 'var(--label)',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        serif: [
          '"Playfair Display"',
          '"Songti SC"',
          '"Noto Serif SC"',
          'Georgia',
          'serif',
        ],
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
}
