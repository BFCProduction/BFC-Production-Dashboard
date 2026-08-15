/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Matches Sunday Ops' dark shell so the two apps feel like one system.
        brand: {
          sidebar: '#0d0d0d',
          header: '#1a1a1a',
          shell: '#111827',
        },
        // Calendar layer colors (see docs / project note classifier).
        layer: {
          personal: '#3b82f6', // blue  — crew Google calendars
          pco: '#22c55e',      // green — production PCO plan times
          monday: '#f97316',   // orange — monday task due-times
        },
      },
    },
  },
  plugins: [],
}
