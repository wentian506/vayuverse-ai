import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vayu: {
          midnight: '#081426',
          abyss: '#060F1E',
          deep: '#102C50',
          panel: '#0D213D',
          electric: '#3478F6',
          cyan: '#21D4E8',
          teal: '#12BFA5',
          white: '#FFFFFF',
          soft: '#F3F7FC',
          purple: '#8067F5',
        },
        aqi: {
          good: '#12BFA5',
          satisfactory: '#84CC16',
          moderate: '#EAB308',
          poor: '#F97316',
          verypoor: '#EF4444',
          severe: '#B91C1C',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 32px rgba(33, 212, 232, 0.16)',
        'glow-electric': '0 0 32px rgba(52, 120, 246, 0.24)',
        'glow-teal': '0 0 28px rgba(18, 191, 165, 0.2)',
        'glow-purple': '0 0 28px rgba(128, 103, 245, 0.22)',
        glass: '0 16px 48px rgba(3, 10, 22, 0.45)',
      },
      backgroundImage: {
        'vayu-mesh':
          'radial-gradient(at 15% 15%, rgba(52, 120, 246, 0.18) 0px, transparent 50%), radial-gradient(at 85% 10%, rgba(33, 212, 232, 0.14) 0px, transparent 45%), radial-gradient(at 70% 80%, rgba(128, 103, 245, 0.12) 0px, transparent 50%), radial-gradient(at 20% 85%, rgba(18, 191, 165, 0.1) 0px, transparent 45%)',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.95', transform: 'scale(1.03)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 6s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
