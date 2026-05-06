/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] },
      colors: {
        brand: {
          blue: '#5B7FFF', pink: '#FF6B8A', green: '#22C55E',
          orange: '#F97316', purple: '#8B5CF6', teal: '#14B8A6',
          yellow: '#EAB308', red: '#EF4444'
        }
      }
    }
  },
  plugins: []
}
