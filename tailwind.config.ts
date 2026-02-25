import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#f8f5ef',
          100: '#f1ebdf',
          200: '#e4d8c2',
          300: '#d6c4a4'
        },
        clay: {
          500: '#b86a4d',
          600: '#9c563d'
        },
        olive: {
          500: '#6f7d4e',
          600: '#59643e'
        },
        stonewarm: {
          100: '#ebe8e2',
          200: '#d7d2c8',
          700: '#4f4a43',
          900: '#2f2b26'
        },
        amberearth: '#d39f4f',
        moss: '#588157',
        terracotta: '#b04a36'
      },
      boxShadow: {
        soft: '0 8px 24px rgba(60, 48, 35, 0.12)'
      },
      borderRadius: {
        xl2: '1rem'
      },
      fontFamily: {
        sans: ['"Manrope"', '"Segoe UI"', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config;
