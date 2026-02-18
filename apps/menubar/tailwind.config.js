/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          50: "#1a1a2e",
          100: "#16213e",
          200: "#0f3460",
        },
        accent: {
          DEFAULT: "#00d4aa",
          dim: "#008b70",
        },
      },
    },
  },
  plugins: [],
};
