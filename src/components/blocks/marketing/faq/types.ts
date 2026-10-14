export interface FaqItem {
  question: string
  answer: string
}
export interface FaqProps {
  title?: string
  eyebrow?: string
  variant?: 'default' | 'split'
  items: FaqItem[]
}
