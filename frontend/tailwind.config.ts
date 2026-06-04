import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          body: "#10120f",
          panel: "#191d19",
          card: "#202620",
          hover: "#242a24",
          accent: "#2bb3a3",
          accentHover: "#39c9b8",
          text: "#e7ece7",
          muted: "#a9b4aa",
          border: "#343d34",
          input: "#111510"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  }
} satisfies Config;

