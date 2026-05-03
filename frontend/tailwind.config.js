/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#1B8745",
          success: "#27AE60",
          warning: "#FF9D00",
          danger: "#E74C3C",
          info: "#0066CC"
        },
        neutral: {
          50: "#FAFAFA",
          100: "#F3F4F6",
          200: "#E5E7EB",
          500: "#6B7280",
          800: "#1F2937",
          900: "#111827"
        }
      }
    }
  },
  plugins: []
};

