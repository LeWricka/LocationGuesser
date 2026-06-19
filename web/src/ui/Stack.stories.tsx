import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { Stack } from './Stack'

const Box = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3)',
    }}
  >
    {children}
  </div>
)

const meta = {
  title: 'UI/Stack',
  component: Stack,
  argTypes: {
    gap: { control: { type: 'number', min: 1, max: 8, step: 1 } },
    align: { control: 'inline-radio', options: ['start', 'center', 'end', 'stretch'] },
  },
} satisfies Meta<typeof Stack>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    gap: 4,
    children: (
      <>
        <Box>Uno</Box>
        <Box>Dos</Box>
        <Box>Tres</Box>
      </>
    ),
  },
}

export const TightGap: Story = { ...Default, args: { ...Default.args, gap: 2 } }
export const WideGap: Story = { ...Default, args: { ...Default.args, gap: 6 } }
export const AlignCenter: Story = { ...Default, args: { ...Default.args, align: 'center' } }
