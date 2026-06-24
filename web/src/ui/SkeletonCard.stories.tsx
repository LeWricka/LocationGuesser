import type { Meta, StoryObj } from '@storybook/react-vite'
import { SkeletonCard } from './SkeletonCard'

const meta = {
  title: 'UI/SkeletonCard',
  component: SkeletonCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SkeletonCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithAction: Story = {
  args: { action: true },
}

export const WithAvatar: Story = {
  args: { avatar: true, lines: 2 },
}
