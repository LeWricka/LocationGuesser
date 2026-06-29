import type { Meta, StoryObj } from '@storybook/react-vite'
import { Logo } from './Logo'

const meta = {
  title: 'UI/Logo',
  component: Logo,
  argTypes: {
    variant: { control: 'inline-radio', options: ['mark', 'wordmark'] },
    size: { control: { type: 'range', min: 16, max: 96, step: 4 } },
    monochrome: { control: 'boolean' },
  },
} satisfies Meta<typeof Logo>

export default meta
type Story = StoryObj<typeof meta>

export const Wordmark: Story = { args: { variant: 'wordmark', size: 32 } }
export const Mark: Story = { args: { variant: 'mark', size: 40 } }

// Monocromo sobre el acento (p.ej. cabecera de color o splash).
export const SobreAcento: Story = {
  args: { variant: 'wordmark', size: 32, monochrome: true },
  render: (args) => (
    <div style={{ background: '#34506b', color: '#fff', padding: 24, borderRadius: 12 }}>
      <Logo {...args} />
    </div>
  ),
}

export const Escalas: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
      <Logo variant="wordmark" size={20} />
      <Logo variant="wordmark" size={32} />
      <Logo variant="wordmark" size={48} />
      <Logo variant="mark" size={48} />
    </div>
  ),
}
