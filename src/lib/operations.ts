import { z } from 'zod';

export const experimentSchema = z
  .object({
    title: z.string().trim().min(1).max(191),
    observation: z.string().trim().min(1).max(5000),
    hypothesis: z.string().trim().min(1).max(5000),
    change: z.string().trim().min(1).max(5000),
    buildId: z.string().trim().max(191),
    sampleTarget: z.coerce.number().int().min(1).max(1_000_000),
  })
  .strict();
export type ExperimentInput = z.infer<typeof experimentSchema>;
export interface Experiment extends ExperimentInput {
  id: string;
  status: 'observing' | 'completed' | 'stopped';
  result: string;
  createdAt: string;
  updatedAt: string;
}
export const experimentResultSchema = z
  .object({
    id: z.string().min(1).max(191),
    status: z.enum(['completed', 'stopped']),
    result: z.string().trim().min(1).max(5000),
  })
  .strict();

export interface OperationsCounts {
  visitors: number;
  signups: number;
  active: number;
  selected: number;
  checkouts: number;
  paid: number;
  revenue: { currency: string; amount: number }[];
}
export interface OperationsReport {
  generatedAt: string;
  buildId: string;
  today: {
    from: string;
    to: string;
    orders: number;
    payers: number;
    revenue: { currency: string; amount: number }[];
  };
  yesterday: {
    from: string;
    to: string;
    orders: number;
    payers: number;
    revenue: { currency: string; amount: number }[];
  };
  unpaid24h: number;
  ai: { success: number; failed: number; pending: number };
  openTickets: number;
  lastPaidAt: string | null;
  trackingSince: string | null;
  totals: OperationsCounts;
  rows: (OperationsCounts & { value: string })[];
  days: {
    day: string;
    signups: number;
    payers: number;
    orders: number;
    revenue: { currency: string; amount: number }[];
  }[];
}

export function formatOperationsMoney(
  amount: number,
  currency: string,
  locale: string
) {
  try {
    const fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
    });
    return fmt.format(
      amount / 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2)
    );
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

export function sameTimeWindows(now: Date, offset = 480) {
  const dayMs = 86400000;
  const shifted = now.getTime() + offset * 60000;
  const start = Math.floor(shifted / dayMs) * dayMs - offset * 60000;
  return {
    todayFrom: new Date(start),
    todayTo: now,
    yesterdayFrom: new Date(start - dayMs),
    yesterdayTo: new Date(now.getTime() - dayMs),
  };
}
