/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark mode surface tokens for consistent use across the app
        surface: {
          0: '#0a1620',
          1: '#0f2030',
          2: '#142a3d',
          3: '#1a3548',
        },
      },
    },
  },
  plugins: [],
};
