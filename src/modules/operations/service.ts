import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';

import { affectedRows, db } from '@/core/db';
import { envConfigs } from '@/config';
import {
  aiTask,
  operationsExperiment as experiment,
  order,
  permission,
  role,
  rolePermission,
  ticket,
  user,
  userEvent,
  userRole,
  analyticsVisitor as visitor,
  type AnalyticsVisitor,
  type OperationsExperiment,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import {
  sameTimeWindows,
  type ExperimentInput,
  type OperationsCounts,
  type OperationsReport,
} from '@/lib/operations';

const DAY = 86400000;
const paidStatuses = ['paid', 'refunding', 'refunded'];
// Any role carrying admin.access or an admin wildcard is staff, including custom roles.
const staff = () =>
  exists(
    db()
      .select({ id: userRole.id })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .innerJoin(
        rolePermission,
        and(
          eq(rolePermission.roleId, role.id),
          isNull(rolePermission.deletedAt)
        )
      )
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(
        and(
          eq(userRole.userId, user.id),
          eq(role.status, 'active'),
          or(isNull(userRole.expiresAt), gte(userRole.expiresAt, new Date())),
          inArray(permission.code, ['*', 'admin.*', 'admin.access'])
        )
      )
  );
const human = () =>
  and(
    eq(user.type, 'user'),
    notExists(
      db()
        .select({ id: visitor.id })
        .from(visitor)
        .where(and(eq(visitor.userId, user.id), eq(visitor.excluded, true)))
    ),
    sql`not (${staff()})`
  );
const liveOrder = () =>
  and(isNull(order.deletedAt), ne(order.status, 'deleted'));
const nonRenewal = () =>
  or(isNull(order.paymentType), ne(order.paymentType, 'renew'));
const currency = sql<string>`lower(coalesce(${order.paymentCurrency}, ${order.currency}))`;
const net = sql<number>`sum(coalesce(${order.paymentAmount}, ${order.amount}) - coalesce(${order.refundAmount}, 0))`;
const within = (column: Parameters<typeof gte>[0], from: Date, to: Date) =>
  and(gte(column, from), lt(column, to));
const n = (rows: { n: unknown }[]) => Number(rows[0]?.n ?? 0);
const money = (rows: { currency: string; amount: unknown }[]) =>
  rows.map((r) => ({ currency: r.currency, amount: Number(r.amount ?? 0) }));
function dayBucket(column: SQLWrapper) {
  if (['postgres', 'postgresql'].includes(envConfigs.database_provider))
    return sql<string>`to_char(${column} + interval '8 hours', 'YYYY-MM-DD')`;
  if (envConfigs.database_provider === 'mysql')
    return sql<string>`date_format(date_add(${column}, interval 8 hour), '%Y-%m-%d')`;
  return sql<string>`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch', '+8 hours')`;
}

export async function recordVisitor(
  input: Omit<AnalyticsVisitor, 'createdAt'>
) {
  const [existing] = (await db()
    .select()
    .from(visitor)
    .where(eq(visitor.id, input.id))
    .limit(1)) as AnalyticsVisitor[];
  if (!existing) {
    const row = { ...input, createdAt: new Date() };
    // Compatible across dialects; a concurrent first request may lose the PK race.
    try {
      await db().insert(visitor).values(row);
    } catch (error) {
      const [winner] = await db()
        .select({ id: visitor.id })
        .from(visitor)
        .where(eq(visitor.id, input.id))
        .limit(1);
      if (!winner) throw error;
    }
  }
  if (input.userId) await linkVisitor(input.id, input.userId);
}

export async function linkVisitor(id: string, userId: string) {
  // Claim only an unlinked browser. Signing in to another account must never
  // move the original first-touch cohort to that account.
  await db()
    .update(visitor)
    .set({ userId })
    .where(and(eq(visitor.id, id), isNull(visitor.userId)));
}

async function period(from: Date, to: Date) {
  const where = and(
    human(),
    liveOrder(),
    inArray(order.status, paidStatuses),
    within(order.paidAt, from, to)
  );
  const [totals, revenue] = await Promise.all([
    db()
      .select({
        orders: count(),
        payers: sql<number>`count(distinct ${order.userId})`,
      })
      .from(order)
      .innerJoin(user, eq(user.id, order.userId))
      .where(where),
    db()
      .select({ currency, amount: net })
      .from(order)
      .innerJoin(user, eq(user.id, order.userId))
      .where(where)
      .groupBy(currency),
  ]);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    orders: Number(totals[0]?.orders ?? 0),
    payers: Number(totals[0]?.payers ?? 0),
    revenue: money(revenue),
  };
}

export async function getOperationsReport({
  days = 7,
  groupBy = 'source',
  now = new Date(),
}: {
  days?: number;
  groupBy?: 'source' | 'country' | 'buildId' | 'entryPath';
  now?: Date;
} = {}): Promise<OperationsReport> {
  const { todayFrom, yesterdayFrom, yesterdayTo } = sameTimeWindows(now);
  const from = new Date(todayFrom.getTime() - (days - 1) * DAY);
  const beforeNow = lt(order.paidAt, now);
  const cohort = and(
    within(visitor.createdAt, from, now),
    eq(visitor.excluded, false),
    or(isNull(visitor.userId), human())
  );
  const signedUp = and(
    gte(user.createdAt, visitor.createdAt),
    lt(user.createdAt, now)
  );
  const reached = (
    table: typeof order | typeof aiTask | typeof userEvent,
    condition: SQL | undefined
  ) =>
    exists(
      db()
        .select({ id: table.id })
        .from(table)
        .where(
          and(
            eq(table.userId, visitor.userId),
            gte(table.createdAt, visitor.createdAt),
            lt(table.createdAt, now),
            condition
          )
        )
    );
  const fields = {
    visitors: count(),
    signups: sql<number>`sum(case when ${signedUp} then 1 else 0 end)`,
    active: sql<number>`sum(case when ${signedUp} and ${reached(aiTask, isNull(aiTask.deletedAt))} then 1 else 0 end)`,
    selected: sql<number>`sum(case when ${signedUp} and ${reached(userEvent, eq(userEvent.kind, 'plan_selected'))} then 1 else 0 end)`,
    checkouts: sql<number>`sum(case when ${signedUp} and ${reached(order, and(liveOrder(), nonRenewal()))} then 1 else 0 end)`,
    paid: sql<number>`sum(case when ${signedUp} and ${reached(order, and(liveOrder(), nonRenewal(), inArray(order.status, paidStatuses), beforeNow))} then 1 else 0 end)`,
  };
  const dimension = visitor[groupBy];
  // Earliest eligible browser wins for a signed-in user, so multiple browsers
  // cannot inflate signups or attribute the same order to several channels.
  const firstBrowser = sql`${visitor.id} = (select av.id from analytics_visitor av where av.user_id = ${visitor.userId} and av.excluded = ${false} order by av.created_at, av.id limit 1)`;
  const where = and(cohort, or(isNull(visitor.userId), firstBrowser));
  const revenueWhere = and(
    where,
    signedUp,
    liveOrder(),
    inArray(order.status, paidStatuses),
    gte(order.paidAt, visitor.createdAt),
    beforeNow,
    nonRenewal()
  );
  const signupDay = dayBucket(user.createdAt);
  const paymentDay = dayBucket(order.paidAt);
  const dailyPaidWhere = and(
    human(),
    liveOrder(),
    inArray(order.status, paidStatuses),
    within(order.paidAt, from, now)
  );
  const [
    today,
    yesterday,
    unpaid,
    ai,
    tickets,
    last,
    tracking,
    totalsRows,
    rows,
    revenueRows,
    dailySignups,
    dailyPayments,
    dailyRevenue,
  ] = await Promise.all([
    period(todayFrom, now),
    period(yesterdayFrom, yesterdayTo),
    db()
      .select({ n: sql<number>`count(distinct ${order.userId})` })
      .from(order)
      .innerJoin(user, eq(user.id, order.userId))
      .where(
        and(
          human(),
          liveOrder(),
          nonRenewal(),
          inArray(order.status, ['created', 'pending']),
          within(order.createdAt, new Date(now.getTime() - DAY), now)
        )
      ),
    db()
      .select({ status: aiTask.status, n: count() })
      .from(aiTask)
      .innerJoin(user, eq(user.id, aiTask.userId))
      .where(
        and(
          human(),
          isNull(aiTask.deletedAt),
          within(aiTask.createdAt, new Date(now.getTime() - DAY), now)
        )
      )
      .groupBy(aiTask.status),
    db()
      .select({ n: count() })
      .from(ticket)
      .innerJoin(user, eq(user.id, ticket.userId))
      .where(and(human(), eq(ticket.status, 'open'))),
    db()
      .select({ paidAt: order.paidAt })
      .from(order)
      .innerJoin(user, eq(user.id, order.userId))
      .where(
        and(
          human(),
          liveOrder(),
          inArray(order.status, paidStatuses),
          beforeNow
        )
      )
      .orderBy(desc(order.paidAt))
      .limit(1),
    db()
      .select({ createdAt: visitor.createdAt })
      .from(visitor)
      .where(eq(visitor.excluded, false))
      .orderBy(visitor.createdAt)
      .limit(1),
    db()
      .select(fields)
      .from(visitor)
      .leftJoin(user, eq(user.id, visitor.userId))
      .where(where),
    db()
      .select({ value: dimension, ...fields })
      .from(visitor)
      .leftJoin(user, eq(user.id, visitor.userId))
      .where(where)
      .groupBy(dimension)
      .orderBy(desc(count()))
      .limit(100),
    db()
      .select({ value: dimension, currency, amount: net })
      .from(visitor)
      .innerJoin(user, eq(user.id, visitor.userId))
      .innerJoin(order, eq(order.userId, user.id))
      .where(revenueWhere)
      .groupBy(dimension, currency),
    db()
      .select({ day: signupDay, n: count() })
      .from(user)
      .where(and(human(), within(user.createdAt, from, now)))
      .groupBy(signupDay),
    db()
      .select({
        day: paymentDay,
        orders: count(),
        payers: sql<number>`count(distinct ${order.userId})`,
      })
      .from(order)
      .innerJoin(user, eq(user.id, order.userId))
      .where(dailyPaidWhere)
      .groupBy(paymentDay),
    db()
      .select({ day: paymentDay, currency, amount: net })
      .from(order)
      .innerJoin(user, eq(user.id, order.userId))
      .where(dailyPaidWhere)
      .groupBy(paymentDay, currency),
  ]);
  const toCounts = (row: Record<string, unknown>): OperationsCounts => ({
    visitors: Number(row.visitors ?? 0),
    signups: Number(row.signups ?? 0),
    active: Number(row.active ?? 0),
    selected: Number(row.selected ?? 0),
    checkouts: Number(row.checkouts ?? 0),
    paid: Number(row.paid ?? 0),
    revenue: [],
  });
  const aggregateMoney = new Map<string, number>();
  for (const r of revenueRows as { currency: string; amount: unknown }[])
    aggregateMoney.set(
      r.currency,
      (aggregateMoney.get(r.currency) ?? 0) + Number(r.amount ?? 0)
    );
  const aiCount = (statuses: string[]) =>
    (ai as { status: string; n: unknown }[])
      .filter((r) => statuses.includes(r.status))
      .reduce((sum, r) => sum + Number(r.n), 0);
  return {
    generatedAt: now.toISOString(),
    buildId: import.meta.env?.VITE_BUILD_ID || 'development',
    today,
    yesterday,
    unpaid24h: n(unpaid),
    ai: {
      success: aiCount(['success']),
      failed: aiCount(['failed', 'canceled']),
      pending: aiCount(['pending', 'processing']),
    },
    openTickets: n(tickets),
    lastPaidAt: last[0]?.paidAt?.toISOString() ?? null,
    trackingSince: tracking[0]?.createdAt?.toISOString() ?? null,
    totals: {
      ...toCounts(totalsRows[0] ?? {}),
      revenue: [...aggregateMoney].map(([currency, amount]) => ({
        currency,
        amount,
      })),
    },
    rows: rows.map((r: Record<string, unknown>) => ({
      ...toCounts(r),
      value: String(r.value ?? ''),
      revenue: money(
        revenueRows.filter((v: { value: string }) => v.value === r.value)
      ),
    })),
    days: Array.from({ length: days }, (_, i) => {
      const day = new Date(from.getTime() + i * DAY + 480 * 60000)
        .toISOString()
        .slice(0, 10);
      const payments = dailyPayments.find(
        (r: { day: string }) => r.day === day
      );
      return {
        day,
        signups: Number(
          dailySignups.find((r: { day: string }) => r.day === day)?.n ?? 0
        ),
        payers: Number(payments?.payers ?? 0),
        orders: Number(payments?.orders ?? 0),
        revenue: money(
          dailyRevenue.filter((r: { day: string }) => r.day === day)
        ),
      };
    }),
  };
}

export async function listExperiments() {
  return db()
    .select()
    .from(experiment)
    .orderBy(desc(experiment.createdAt))
    .limit(100) as Promise<OperationsExperiment[]>;
}
export async function createExperiment(
  input: ExperimentInput,
  actorId: string
) {
  const now = new Date();
  const row = {
    ...input,
    id: getUuid(),
    status: 'observing',
    result: '',
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  await db().insert(experiment).values(row);
  return row;
}
export async function concludeExperiment(input: {
  id: string;
  status: 'completed' | 'stopped';
  result: string;
}) {
  const changed = await db()
    .update(experiment)
    .set({ status: input.status, result: input.result, updatedAt: new Date() })
    .where(
      and(eq(experiment.id, input.id), eq(experiment.status, 'observing'))
    );
  return affectedRows(changed) !== 0;
}
