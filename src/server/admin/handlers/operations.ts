import {
  concludeExperiment,
  createExperiment,
  getOperationsReport,
  listExperiments,
} from '@/modules/operations/service';
import { experimentResultSchema, experimentSchema } from '@/lib/operations';
import { respData, respErr } from '@/lib/resp';

import type { AdminHandlerContext } from '../types';

export async function GET({ request }: AdminHandlerContext) {
  const params = new URL(request.url).searchParams;
  return respData(
    await getOperationsReport({
      days: Number(params.get('days') || 7),
      groupBy: (params.get('groupBy') || 'source') as
        'source' | 'country' | 'buildId' | 'entryPath',
    })
  );
}
export async function LIST() {
  return respData(await listExperiments());
}
export async function POST({ request, actor }: AdminHandlerContext) {
  return respData(
    await createExperiment(
      experimentSchema.parse(await request.json()),
      actor.userId
    )
  );
}
export async function PATCH({ request }: AdminHandlerContext) {
  const changed = await concludeExperiment(
    experimentResultSchema.parse(await request.json())
  );
  return changed
    ? respData({ ok: true })
    : respErr('Experiment is missing or already concluded', { status: 409 });
}
