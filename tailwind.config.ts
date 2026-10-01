import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#090c12',
        panel: '#11161e',
        mint: '#a6f2cd',
      },
    },
  },
  plugins: [],
};

export default config;
