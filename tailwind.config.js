/** @type {import('tailwindcss').Config} */
// =============================================================
// Tailwind tokens read from CSS variables defined in
// src/styles/theme.css. Vars hold space-separated RGB triplets
// so the `<alpha-value>` placeholder enables every opacity
// modifier (bg-teal/10, ring-teal/40, etc.).
// =============================================================

const rgb = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: rgb('--color-navy'),
        teal: rgb('--color-teal'),
        cream: rgb('--color-cream'),
        surface: rgb('--color-surface'),
        'surface-alt': rgb('--color-surface-alt'),
        // border uses its own alpha variable
        border: 'rgb(var(--color-border) / var(--border-alpha))',
        text: rgb('--color-text'),
        muted: rgb('--color-muted'),
        green: {
          DEFAULT: rgb('--color-green'),
          bg: rgb('--color-green-bg'),
          fg: rgb('--color-green-fg'),
        },
        red: {
          DEFAULT: rgb('--color-red'),
          bg: rgb('--color-red-bg'),
          fg: rgb('--color-red-fg'),
        },
        blue: {
          DEFAULT: rgb('--color-blue'),
          bg: rgb('--color-blue-bg'),
          fg: rgb('--color-blue-fg'),
        },
        amber: {
          DEFAULT: rgb('--color-amber'),
          bg: rgb('--color-amber-bg'),
          fg: rgb('--color-amber-fg'),
        },
        purple: {
          DEFAULT: rgb('--color-purple'),
          bg: rgb('--color-purple-bg'),
          fg: rgb('--color-purple-fg'),
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        'card-lg': '20px',
        pill: '100px',
      },
      boxShadow: {
        soft: '0 4px 14px rgba(15, 31, 61, 0.08)',
        card: '0 2px 10px rgba(0, 0, 0, 0.05)',
        modal: '0 20px 60px rgba(0, 0, 0, 0.25)',
      },
      backgroundImage: {
        'hero-gradient':
          'linear-gradient(145deg, rgb(var(--color-navy)) 0%, #1b2a4a 60%, rgb(var(--color-teal)) 100%)',
        'auth-gradient':
          'linear-gradient(145deg, rgb(var(--color-navy)), #1b2a4a, rgb(var(--color-teal)))',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(8%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%': { transform: 'scale(.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        notifShrink: {
          '0%':   { width: '100%' },
          '100%': { width: '0%' },
        },
      },
      animation: {
        slideUp: 'slideUp 0.25s cubic-bezier(.34,1.56,.64,1)',
        'slide-up': 'slideUp 0.25s cubic-bezier(.34,1.56,.64,1)',
        fadeIn: 'fadeIn 0.2s ease',
        'fade-in': 'fadeIn 0.2s ease',
        popIn: 'popIn 0.18s ease',
        'pop-in': 'popIn 0.18s ease',
        notifShrink: 'notifShrink linear forwards',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
