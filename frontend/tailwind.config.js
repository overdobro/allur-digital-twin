/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b1017",
        panel: "#121a24",
        panel2: "#18222f",
        line: "#243244",
        muted: "#8696a8",
        brand: "#ef3e36",
        ok: "#22c55e",
        warn: "#f59e0b",
        crit: "#ef4444",
        nodata: "#64748b",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "monospace"] },
    },
  },
  plugins: [],
};
