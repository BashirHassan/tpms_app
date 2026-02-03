/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        'xs': '475px', // Extra small breakpoint for mobile-first design
      },
      colors: {
        // Dynamic primary colors using CSS variables
        // Falls back to legacy brand teal (#096c74) if variables not set
        primary: {
          50: 'var(--color-primary-50, #f7fefe)',
          100: 'var(--color-primary-100, #ccfbfd)',
          200: 'var(--color-primary-200, #99f2f7)',
          300: 'var(--color-primary-300, #5ce4ed)',
          400: 'var(--color-primary-400, #22ccd9)',
          500: 'var(--color-primary-500, #0aacba)',
          DEFAULT: 'var(--color-primary-600, #096c74)',
          600: 'var(--color-primary-600, #096c74)',
          700: 'var(--color-primary-700, #0a5960)',
          800: 'var(--color-primary-800, #0d484e)',
          900: 'var(--color-primary-900, #0f3c41)',
          950: 'var(--color-primary-950, #052629)',
        },
        // Dynamic secondary colors using CSS variables
        secondary: {
          50: 'var(--color-secondary-50, #fdf4ff)',
          100: 'var(--color-secondary-100, #fae8ff)',
          200: 'var(--color-secondary-200, #f5d0fe)',
          300: 'var(--color-secondary-300, #f0abfc)',
          400: 'var(--color-secondary-400, #e879f9)',
          500: 'var(--color-secondary-500, #d946ef)',
          DEFAULT: 'var(--color-secondary-500, #d946ef)',
          600: 'var(--color-secondary-600, #c026d3)',
          700: 'var(--color-secondary-700, #a21caf)',
          800: 'var(--color-secondary-800, #86198f)',
          900: 'var(--color-secondary-900, #701a75)',
          950: 'var(--color-secondary-950, #4a044e)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
