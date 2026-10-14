import type { ReactNode } from 'react'

export interface FeatureItem {
  icon?: ReactNode
  title: string
  description: string
  detail?: string
  visual?: ReactNode
  wide?: boolean
}
export interface FeaturesProps {
  title?: string
  subtitle?: string
  eyebrow?: string
  variant?: 'default' | 'bento'
  columns?: 2 | 3 | 4
  items: FeatureItem[]
}
