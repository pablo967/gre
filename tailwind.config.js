/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#f8fafc',
        primary: '#ffffff',
        secondary: '#f1f5f9',
        accent: {
          light: '#cbd5e1',
          DEFAULT: '#3b82f6',
          hover: '#2563eb'
        },
        text: {
          primary: '#0f172a',
          secondary: '#475569',
          tertiary: '#94a3b8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
