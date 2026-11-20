import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#C2410C', // orange-700: contraste AA (5.2:1) com texto branco
          hover: '#9A3412', // orange-800
          soft: '#FFEDD5', // orange-100
          foreground: '#FFFFFF',
        },
        surface: '#FFFFFF',
        page: '#F8FAFC',
        success: { DEFAULT: '#16A34A', foreground: '#FFFFFF' },
        danger: { DEFAULT: '#DC2626', hover: '#B91C1C', foreground: '#FFFFFF' },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      spacing: {
        nav: '4rem', // altura da BottomNav (h-16)
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
} satisfies Config;
