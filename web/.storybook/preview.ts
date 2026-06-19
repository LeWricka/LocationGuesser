import type { Preview } from '@storybook/react-vite'
// Tokens + base global (tema oscuro) para que las stories se vean como la app.
import '../src/index.css'

const preview: Preview = {
  parameters: {
    // Fondo de la app (token --color-bg) para el lienzo de las stories.
    backgrounds: {
      default: 'app',
      values: [{ name: 'app', value: '#0e0f14' }],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
