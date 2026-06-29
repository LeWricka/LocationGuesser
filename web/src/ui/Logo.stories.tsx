import type { Meta, StoryObj } from '@storybook/react-vite'
import { Logo } from './Logo'

const meta = {
  title: 'UI/Logo',
  component: Logo,
  argTypes: {
    variant: { control: 'inline-radio', options: ['mark', 'wordmark'] },
    tone: { control: 'inline-radio', options: ['current', 'accent'] },
    size: { control: { type: 'number', min: 16, max: 96, step: 4 } },
  },
} satisfies Meta<typeof Logo>

export default meta
type Story = StoryObj<typeof meta>

export const Mark: Story = { args: { variant: 'mark', size: 48 } }
export const Wordmark: Story = { args: { variant: 'wordmark', size: 36 } }
export const Acento: Story = { args: { variant: 'wordmark', tone: 'accent', size: 36 } }

export const Tamanos: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <Logo variant="mark" size={20} />
      <Logo variant="mark" size={32} />
      <Logo variant="mark" size={48} />
      <Logo variant="wordmark" size={32} tone="accent" />
    </div>
  ),
}
