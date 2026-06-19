import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { Row } from './Row'

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
  title: 'UI/Row',
  component: Row,
  argTypes: {
    gap: { control: { type: 'number', min: 1, max: 6, step: 1 } },
    align: { control: 'inline-radio', options: ['start', 'center', 'end', 'baseline', 'stretch'] },
    justify: { control: 'inline-radio', options: ['start', 'center', 'end', 'between'] },
    wrap: { control: 'boolean' },
  },
} satisfies Meta<typeof Row>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <>
        <Box>Uno</Box>
        <Box>Dos</Box>
        <Box>Tres</Box>
      </>
    ),
  },
}

export const JustifyBetween: Story = { ...Default, args: { ...Default.args, justify: 'between' } }
export const JustifyCenter: Story = { ...Default, args: { ...Default.args, justify: 'center' } }
export const Wrap: Story = {
  args: {
    wrap: true,
    children: Array.from({ length: 10 }, (_, i) => <Box key={i}>Item {i + 1}</Box>),
  },
}
