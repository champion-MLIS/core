import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        champion: {
          ink: '#1a1a1a',
          soft: '#f6f4ef',
          accent: '#8b6f47',
          attention: '#c46a48',
        },
      },
    },
  },
  plugins: [],
};

export default config;
