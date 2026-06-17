/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 「主屋」温柔配色
        home: {
          bg: '#1c1a1f',
          panel: '#26222b',
          card: '#2f2a35',
          border: '#3a3340',
          rose: '#e8a0bf',
          plum: '#b58bd6',
          gold: '#e8c07d',
          text: '#efe9f2',
          muted: '#a99fb2',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
}
