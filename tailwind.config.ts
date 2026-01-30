import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 12px 35px rgba(236, 72, 153, 0.18)"
      }
    }
  },
  plugins: []
} satisfies Config;

