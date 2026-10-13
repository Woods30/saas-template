export interface FaqItem {
  question: string
  answer: string
}
export interface FaqProps {
  title?: string
  items: FaqItem[]
}
