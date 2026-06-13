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
          light: '#E5C767',
          DEFAULT: '#D4AF37', // Gold
          dark: '#B3912A',
        },
        secondary: {
          light: '#FFF5F8',
          DEFAULT: '#FFF0F5', // Blush Pink
          dark: '#FFD1DC',
        },
        accent: {
          DEFAULT: '#C21E56', // Deep Rose
        },
        neutral: {
          50: '#FAFAFA',
          100: '#F5F5F5',
          800: '#333333',
          900: '#1A1A1A',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      boxShadow: {
        'premium': '0 10px 30px -10px rgba(212, 175, 55, 0.2)',
      }
    },
  },
  plugins: [],
}

