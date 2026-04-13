import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F4F1E8",
        ink: "#161616",
        accent: "#0F766E",
        ember: "#D97706",
        slate: "#364153"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"]
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 23, 42, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;

