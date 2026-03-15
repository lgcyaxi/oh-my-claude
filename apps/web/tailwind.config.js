/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0f',
          secondary: '#12121a',
          tertiary: '#1a1a25',
          elevated: '#222230',
          hover: '#2a2a3a',
        },
        border: {
          subtle: '#ffffff0a',
          DEFAULT: '#ffffff14',
          strong: '#ffffff22',
        },
        text: {
          primary: '#e8e8ed',
          secondary: '#8888a0',
          tertiary: '#555568',
          inverse: '#0a0a0f',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          dim: '#4f46e5',
          muted: '#6366f120',
        },
        success: {
          DEFAULT: '#22c55e',
          muted: '#22c55e20',
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted: '#f59e0b20',
        },
        danger: {
          DEFAULT: '#ef4444',
          muted: '#ef444420',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
