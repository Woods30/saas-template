export interface Testimonial {
  quote: string
  author: string
  role?: string
  avatar?: string
}
export interface TestimonialsProps {
  title?: string
  items: Testimonial[]
}
