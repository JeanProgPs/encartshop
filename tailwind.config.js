/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './admin/**/*.html',
    './admin/**/*.js',
    './loja/**/*.html',
    './loja/**/*.js',
    './index.html',
    './demo.html',
    './faq.html',
    './privacy.html',
    './support.html',
  ],
  theme: {
    extend: {
      colors: {
        bgPrimary: 'var(--bg-primary)',
        bgSecondary: 'var(--bg-secondary)',
        cardBg: 'var(--card-bg)',
        borderColor: 'var(--border-color)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        accent: 'var(--accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.02)',
      }
    }
  },
  plugins: [],
}
