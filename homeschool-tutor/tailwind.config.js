/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Celestial chrome palette ──────────────────────────────────────
        // Midnight: deep warm navy — the night sky behind constellation art
        midnight: {
          50:  '#eef4f8',
          100: '#d6e4ef',
          200: '#a8c0d4',
          300: '#7299b8',
          400: '#4a7299',
          500: '#2d5275',
          600: '#24405f',
          700: '#1c2f4a',
          800: '#152238',
          900: '#0e1828',
          950: '#080f1e',
        },
        // Amber: warm mustard — stars, lantern light, illuminated accent
        amber: {
          50:  '#fff8ec',
          100: '#fdeecb',
          200: '#f9d898',
          300: '#f5c060',
          400: '#f0a835',  // primary accent
          500: '#e08820',
          600: '#c06e0a',
          700: '#9c5400',
          800: '#7c3f00',
          900: '#5a2e00',
        },
        // Coral: terracotta from the botanical flowers — request_narration
        coral: {
          50:  '#fdf3f1',
          100: '#fae0dc',
          200: '#f4bfb6',
          300: '#eb9486',
          400: '#e07060',
          500: '#d4503a',
          600: '#b83828',
          700: '#8b2a1e',
        },
        // Sky: dusty teal — constellation outlines, offer_socratic_hint
        sky: {
          50:  '#f0f8fb',
          100: '#dff0f6',
          200: '#bedde9',
          300: '#92c6d8',
          400: '#6aafc4',
          500: '#4a92ad',
          600: '#327591',
          700: '#245f78',
          800: '#1a4a5e',
        },
        // Star cream — text on dark midnight backgrounds
        star: '#f5e6c8',

        forest: {
          50: '#f0f7f0', 100: '#d8edd9', 200: '#b3dbb5', 300: '#80c184',
          400: '#52a558', 500: '#348a3a', 600: '#266e2c', 700: '#1f5825',
          800: '#1b4620', 900: '#173a1c',
        },
        navy: {
          50:  '#f0f4fb', 100: '#dce6f7', 200: '#b9cdef', 300: '#87a9e2',
          400: '#5585d5', 500: '#1e3a8a', 600: '#17306e', 700: '#112252',
          800: '#0b1636', 900: '#060c1e',
        },
        gold: {
          50:  '#fefae8', 100: '#fdf2c1', 200: '#fbe585', 300: '#f9d54a',
          400: '#f5c014', 500: '#d4a106', 600: '#a67d05', 700: '#7c5a03',
          800: '#503b02', 900: '#271d01',
        },
        parchment: {
          50: '#fefcf7', 100: '#fdf7e8', 200: '#faedc6',
          300: '#f6de9a', 400: '#f0c95e', 500: '#e8b430',
        },
        verdigris: {
          50:  '#f0f5f2', 100: '#d6e8e0', 200: '#aed0c2', 300: '#7eb39f',
          400: '#569480', 500: '#3d7a68', 600: '#2f6153', 700: '#234a3f',
          800: '#17322b', 900: '#0c1c18',
        },
        claret: {
          50:  '#fdf0f2', 100: '#f9d6db', 200: '#f2adb7', 300: '#e57a8a',
          400: '#d44e63', 500: '#b83049', 600: '#912438', 700: '#6b1b2a',
          800: '#47111c', 900: '#24080e',
        },
        faith: {
          100: '#ede9fe', 200: '#ddd6fe', 500: '#8b5cf6', 600: '#7c3aed',
        },
      },
      fontFamily: {
        // Cinzel — Roman inscriptional; headings, labels, UI chrome
        display: ['"Cinzel"', '"Trajan Pro"', '"Palatino Linotype"', 'serif'],
        // EB Garamond — Renaissance scholarship; body text, chat bubbles
        serif:   ['"EB Garamond"', 'Garamond', 'Georgia', 'Cambria', 'serif'],
        body:    ['"EB Garamond"', 'Garamond', 'Georgia', 'serif'],
      },
      animation: {
        'fade-in':   'fadeIn 0.4s ease-in-out',
        'slide-up':  'slideUp 0.3s ease-out',
        'pulse-soft':'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
    },
  },
  plugins: [],
}
