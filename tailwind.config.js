/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        13: '3.25rem',
      },
      borderRadius: {
        // Playing cards use an elliptical corner, like the real thing.
        card: '10% / 7%',
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        gold: {
          50: '#fdf8e9',
          100: '#f9edc4',
          200: '#f3dd93',
          300: '#eec85c',
          400: '#e9b534',
          500: '#d99a1c',
          600: '#bb7715',
          700: '#955616',
          800: '#7b4519',
          900: '#683a19',
        },
        felt: {
          400: '#1f8f6b',
          500: '#15795a',
          600: '#0f6049',
          700: '#0c4b3a',
          800: '#0a3b2e',
          900: '#082d24',
          950: '#041a15',
        },
        suit: {
          stars: '#4f46e5',
          hearts: '#dc2626',
          clubs: '#15803d',
          spades: '#1e293b',
          diamonds: '#ea580c',
          joker: '#7c3aed',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Georgia', 'ui-serif', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        card: ['"Trebuchet MS"', 'Verdana', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(2, 10, 8, 0.55), 0 2px 6px -2px rgba(2, 10, 8, 0.4)',
        'card-hover': '0 22px 46px -16px rgba(2, 10, 8, 0.65), 0 4px 10px -3px rgba(2, 10, 8, 0.45)',
        glass: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 20px 50px -24px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(233,181,52,0.45), 0 0 28px -6px rgba(233,181,52,0.55)',
      },
      backgroundImage: {
        'felt-table':
          'radial-gradient(ellipse 80% 70% at 50% 42%, #15795a 0%, #0c4b3a 45%, #072a21 100%)',
        'felt-table-light':
          'radial-gradient(ellipse 80% 70% at 50% 42%, #1f9d75 0%, #11795c 48%, #0a5340 100%)',
        'gold-sheen': 'linear-gradient(135deg, #f3dd93 0%, #e9b534 45%, #bb7715 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(233,181,52,0.55)' },
          '70%': { boxShadow: '0 0 0 12px rgba(233,181,52,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(233,181,52,0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'pop-in': 'pop-in 0.25s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        float: 'float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
