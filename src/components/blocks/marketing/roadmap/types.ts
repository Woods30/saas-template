/** 路线图条目的进度状态。 */
export type RoadmapStatus = 'done' | 'active' | 'planned'

export interface RoadmapItem {
  status: RoadmapStatus
  title: string
  description: string
  /** 可选的时间预期（如「2026 Q2」）；未知时留空，不要写「待定」这类占位。 */
  eta?: string
}

export interface RoadmapProps {
  title?: string
  subtitle?: string
  items: RoadmapItem[]
}
