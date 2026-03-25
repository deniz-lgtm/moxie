import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: "#111827",
        "sidebar-hover": "#1f2937",
        "sidebar-active": "rgba(157, 21, 53, 0.3)",
        "sidebar-text": "#ffffff",
        "sidebar-text-active": "#ffffff",
      },
    },
  },
  plugins: [],
};

export default config;
