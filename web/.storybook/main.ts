import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // Catálogo del UI kit: una story por componente en src/ui.
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    // Sin telemetría anónima: este catálogo es interno.
    disableTelemetry: true,
  },
}

export default config
