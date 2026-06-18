/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#f0f7f0',
          100: '#d8edd9',
          200: '#b3dbb5',
          300: '#80c184',
          400: '#52a558',
          500: '#348a3a',
          600: '#266e2c',
          700: '#1f5825',
          800: '#1b4620',
          900: '#173a1c',
        },
        parchment: {
          50: '#fefcf7',
          100: '#fdf7e8',
          200: '#faedc6',
          300: '#f6de9a',
          400: '#f0c95e',
          500: '#e8b430',
        },
        faith: {
          100: '#ede9fe',
          200: '#ddd6fe',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        display: ['"Palatino Linotype"', 'Palatino', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
    },
  },
  plugins: [],
}
