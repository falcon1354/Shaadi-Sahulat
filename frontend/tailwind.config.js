/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF5F8',
          100: '#FDF2F3',
          200: '#FBEFF1',
          300: '#FEF4F7',
          400: '#f5e3e6',
          500: '#ECD4A8',
          600: '#dfc08d',
          700: '#d0ac72',
          800: '#c09858',
          900: '#a37b3d',
        },
        shaadi: {
          gold: '#ECD4A8',
          roseLight: '#FDF2F3',
          roseMedium: '#FBEFF1',
          white: '#FCFBFB',
          roseSoft: '#FEF4F7',
          roseBlush: '#FFF5F8',
          maroon: '#800020',
          cream: '#FFF8E7',
          green: '#10b981',
          rose: '#f43f5e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 20px rgba(168, 85, 247, 0.4)',
      }
    },
  },
  plugins: [],
};
