import type { Config } from 'tailwindcss';

// Every colour is a CSS-variable token (see styles/globals.css). No component hardcodes a hex value.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: { DEFAULT: token('royal'), hover: token('royal-hover'), foreground: token('on-royal') },
        gold: { DEFAULT: token('gold'), soft: token('gold-soft'), deep: token('gold-deep') },
        cream: token('cream'),
        ivory: token('ivory'),
        maroon: { DEFAULT: token('maroon'), deep: token('maroon-deep'), foreground: token('on-maroon') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted') },
        line: token('line'),
        status: {
          draft: token('status-draft'),
          pending: token('status-pending'),
          approved: token('status-approved'),
          sent: token('status-sent'),
          rejected: token('status-rejected'),
        },
        stage: { qualified: token('stage-qualified'), demo: token('stage-demo') },
        focus: token('focus'),
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        editorial: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--maroon) / 0.06), 0 8px 24px -12px rgb(var(--maroon) / 0.18)',
        lift: '0 12px 32px -12px rgb(var(--maroon) / 0.35)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } }, 'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } } },
      animation: { shimmer: 'shimmer 1.6s infinite', 'fade-up': 'fade-up 0.35s ease-out both' },
    },
  },
  plugins: [],
};
export default config;
