import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        'pulse-record': 'pulseRecord 1.4s ease-in-out infinite'
      },
      keyframes: {
        pulseRecord: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.7)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 0 0 24px rgba(239,68,68,0)', transform: 'scale(1.03)' }
        }
      }
    }
  },
  plugins: []
};

export default config;
