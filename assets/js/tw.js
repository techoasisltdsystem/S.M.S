// Shared Tailwind (CDN) theme for every Tech Oasis page. Load right after the Tailwind CDN script.
tailwind.config = {
    theme: {
        extend: {
            colors: {
                // Slate 400/500 and gold 600 are a little darker than the defaults so small text passes WCAG AA (4.5:1) on white and ivory
                slate: { 400: '#66758B', 500: '#59667A' },
                ink: { DEFAULT: '#0A1F1A', 900: '#0A1F1A', 800: '#0F2C24', 700: '#153A30' },
                forest: { DEFAULT: '#0C3B2E', 50: '#EEF6F2', 100: '#D6EAE1', 200: '#A9D2C0', 300: '#6FB39A', 400: '#3A8D7C', 500: '#225A50', 600: '#14584A', 700: '#0C3B2E', 800: '#082A21', 900: '#051C16' },
                gold: { DEFAULT: '#C4A649', 50: '#FBF7EA', 100: '#F4EBCB', 200: '#E9D79A', 300: '#DEC45B', 400: '#C4A649', 500: '#AC903F', 600: '#7A6228', 700: '#6E5925' },
                ivory: { DEFAULT: '#FBF8F1', 100: '#F6F1E6', 200: '#EDE5D3' }
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                display: ['Fraunces', 'Georgia', 'serif']
            },
            boxShadow: {
                luxe: '0 1px 2px rgba(10,31,26,.04), 0 12px 32px -12px rgba(10,31,26,.18)',
                lift: '0 2px 4px rgba(10,31,26,.05), 0 24px 48px -20px rgba(10,31,26,.30)'
            }
        }
    }
};
