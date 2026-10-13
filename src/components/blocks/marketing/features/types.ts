export interface FeatureItem {
  icon?: string
  title: string
  description: string
}
export interface FeaturesProps {
  title?: string
  subtitle?: string
  columns?: 2 | 3 | 4
  items: FeatureItem[]
}
