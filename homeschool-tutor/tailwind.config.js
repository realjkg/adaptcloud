/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Retained for any legacy sage refs still in templates
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
        navy: {
          50:  '#f0f4fb',
          100: '#dce6f7',
          200: '#b9cdef',
          300: '#87a9e2',
          400: '#5585d5',
          500: '#1e3a8a',
          600: '#17306e',
          700: '#112252',
          800: '#0b1636',
          900: '#060c1e',
        },
        gold: {
          50:  '#fefae8',
          100: '#fdf2c1',
          200: '#fbe585',
          300: '#f9d54a',
          400: '#f5c014',
          500: '#d4a106',
          600: '#a67d05',
          700: '#7c5a03',
          800: '#503b02',
          900: '#271d01',
        },
        parchment: {
          50: '#fefcf7',
          100: '#fdf7e8',
          200: '#faedc6',
          300: '#f6de9a',
          400: '#f0c95e',
          500: '#e8b430',
        },
        // Oxidised copper — aged bronze, manuscript covers, classical accent
        verdigris: {
          50:  '#f0f5f2',
          100: '#d6e8e0',
          200: '#aed0c2',
          300: '#7eb39f',
          400: '#569480',
          500: '#3d7a68',
          600: '#2f6153',
          700: '#234a3f',
          800: '#17322b',
          900: '#0c1c18',
        },
        // Warm ink — replaces cold gray-800 for primary text
        ink: {
          50:  '#f5f0eb',
          100: '#e8ddd2',
          200: '#d1bba5',
          300: '#b89478',
          400: '#9e7252',
          500: '#7a5438',
          600: '#5e3f2a',
          700: '#43301f',
          800: '#2d1f14',
          900: '#1a1008',
        },
        // Deep claret — liturgical accent, use sparingly
        claret: {
          50:  '#fdf0f2',
          100: '#f9d6db',
          200: '#f2adb7',
          300: '#e57a8a',
          400: '#d44e63',
          500: '#b83049',
          600: '#912438',
          700: '#6b1b2a',
          800: '#47111c',
          900: '#24080e',
        },
        faith: {
          100: '#ede9fe',
          200: '#ddd6fe',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
      },
      fontFamily: {
        // Cinzel — Roman inscriptional lettering; headings, labels, UI chrome
        display: ['"Cinzel"', '"Trajan Pro"', '"Palatino Linotype"', 'serif'],
        // EB Garamond — Renaissance scholarship; body text, chat bubbles
        serif:   ['"EB Garamond"', 'Garamond', 'Georgia', 'Cambria', 'serif'],
        body:    ['"EB Garamond"', 'Garamond', 'Georgia', 'serif'],
      },
      fontSize: {
        // EB Garamond reads best at slightly larger sizes than sans-serif
        'chat': ['1.0625rem', { lineHeight: '1.65' }],
        'chat-lg': ['1.125rem', { lineHeight: '1.7' }],
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
