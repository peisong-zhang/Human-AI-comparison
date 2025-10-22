/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        secondary: "#1e293b"
      }
    }
  },
  plugins: []
};
