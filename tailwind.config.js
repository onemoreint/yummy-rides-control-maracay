/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        yummy: {
          electric: '#A020F0',
          dark: '#350064',
          black: '#0B0B12',
          white: '#FFFFFF',
          50: '#F7EDFE',
          100: '#EED9FD',
          200: '#DCB2FB',
          300: '#C47FF7',
          400: '#B04DF4',
          500: '#A020F0',
          600: '#8418C7',
          700: '#65119A',
          800: '#4A0B73',
          900: '#350064',
          950: '#1C0036',
        },
        ink: { 900: '#0B0B12', 800: '#13131D', 700: '#1B1B28', 600: '#262636', 500: '#3A3A4E' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { glow: '0 0 0 1px rgba(160,32,240,.35), 0 8px 30px -8px rgba(160,32,240,.45)' },
      keyframes: { fadein: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { fadein: 'fadein .25s ease-out' },
    },
  },
  plugins: [],
};
