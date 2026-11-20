import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import {
  experimentSchema,
  type Experiment,
  type ExperimentInput,
} from '@/lib/operations';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { TextField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const KEY = ['admin-operations-experiments'];

export function OperationsExperiments({
  canWrite,
  buildId,
}: {
  canWrite: boolean;
  buildId: string;
}) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Experiment | null>(null);
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<Experiment[]>('/api/admin/operations/experiments'),
  });
  const save = useMutation({
    mutationFn: (value: ExperimentInput) =>
      apiPost('/api/admin/operations/experiments', value),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: KEY });
      setCreating(false);
      form.reset();
      toast.success(m['admin.operations.saved']());
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const conclude = useMutation({
    mutationFn: (value: { status: 'completed' | 'stopped'; result: string }) =>
      apiPatch('/api/admin/operations/experiments', {
        id: reviewing!.id,
        ...value,
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: KEY });
      setReviewing(null);
      reviewForm.reset();
      toast.success(m['admin.operations.saved']());
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const form = useForm({
    defaultValues: {
      title: '',
      observation: '',
      hypothesis: '',
      change: '',
      buildId,
      sampleTarget: '400',
    },
    validators: {
      onSubmit: z.object({
        title: z.string().trim().min(1).max(191),
        observation: z.string().trim().min(1).max(5000),
        hypothesis: z.string().trim().min(1).max(5000),
        change: z.string().trim().min(1).max(5000),
        buildId: z.string().trim().max(191),
        sampleTarget: z
          .string()
          .regex(/^\d+$/)
          .refine((v) => Number(v) >= 1 && Number(v) <= 1_000_000),
      }),
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(experimentSchema.parse(value)).catch(() => {});
    },
  });
  const reviewForm = useForm({
    defaultValues: {
      result: '',
      status: 'completed' as 'completed' | 'stopped',
    },
    validators: {
      onSubmit: z.object({
        result: z.string().trim().min(1).max(5000),
        status: z.enum(['completed', 'stopped']),
      }),
    },
    onSubmit: async ({ value }) => {
      await conclude.mutateAsync(value).catch(() => {});
    },
  });
  const fieldLabels = {
    title: m['admin.operations.experiment_name'](),
    observation: m['admin.operations.observation'](),
    hypothesis: m['admin.operations.hypothesis'](),
    change: m['admin.operations.change'](),
    buildId: m['admin.operations.build'](),
    sampleTarget: m['admin.operations.sample_target'](),
  };
  const statusLabels = {
    observing: m['admin.operations.observing'](),
    completed: m['admin.operations.completed'](),
    stopped: m['admin.operations.stopped'](),
  };
  return (
    <section className="space-y-5" aria-labelledby="experiment-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="experiment-title" className="text-lg font-semibold">
            {m['admin.operations.experiments']()}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            {m['admin.operations.experiments_hint']()}
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              form.setFieldValue('buildId', buildId);
              setCreating(true);
            }}
          >
            <Plus className="size-4" />
            {m['admin.operations.new_experiment']()}
          </Button>
        )}
      </div>
      {query.isPending ? (
        <p role="status" className="text-muted-foreground py-8 text-sm">
          {m['admin.operations.loading']()}
        </p>
      ) : query.isError ? (
        <div role="alert" className="text-destructive space-y-2 text-sm">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            {m['admin.operations.retry']()}
          </Button>
        </div>
      ) : !query.data?.length ? (
        <div className="border-border bg-muted/20 flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
          <FlaskConical className="text-muted-foreground mb-4 size-7" />
          <h3 className="font-medium">
            {m['admin.operations.no_experiments']()}
          </h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            {m['admin.operations.no_experiments_hint']()}
          </p>
        </div>
      ) : (
        <div className="divide-border border-border divide-y rounded-xl border">
          {query.data.map((entry) => (
            <article key={entry.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant={
                      entry.status === 'observing' ? 'default' : 'secondary'
                    }
                  >
                    {statusLabels[entry.status]}
                  </Badge>
                  <h3 className="font-medium">{entry.title}</h3>
                </div>
                <time
                  className="text-muted-foreground text-xs"
                  dateTime={entry.createdAt}
                >
                  {new Date(entry.createdAt).toLocaleDateString(getLocale(), {
                    timeZone: 'Asia/Shanghai',
                  })}
                </time>
              </div>
              <dl className="grid gap-4 text-sm md:grid-cols-3">
                {(['observation', 'hypothesis', 'change'] as const).map(
                  (key) => (
                    <div key={key}>
                      <dt className="text-muted-foreground mb-1 text-xs">
                        {fieldLabels[key]}
                      </dt>
                      <dd className="break-words whitespace-pre-wrap">
                        {entry[key]}
                      </dd>
                    </div>
                  )
                )}
              </dl>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                <span>
                  {m['admin.operations.build']()}:{' '}
                  <code>{entry.buildId || '—'}</code>
                </span>
                <span>
                  {m['admin.operations.sample_target']()}:{' '}
                  {entry.sampleTarget.toLocaleString()}
                </span>
                {canWrite && entry.status === 'observing' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => {
                      reviewForm.reset();
                      setReviewing(entry);
                    }}
                  >
                    {m['admin.operations.review']()}
                  </Button>
                )}
              </div>
              {entry.result && (
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="mb-1 font-medium">
                    {m['admin.operations.result']()}
                  </p>
                  <p className="break-words whitespace-pre-wrap">
                    {entry.result}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{m['admin.operations.new_experiment']()}</DialogTitle>
            <DialogDescription>
              {m['admin.operations.experiments_hint']()}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            {(
              [
                'title',
                'observation',
                'hypothesis',
                'change',
                'buildId',
                'sampleTarget',
              ] as const
            ).map((key) => (
              <form.Field key={key} name={key}>
                {(field) => (
                  <TextField
                    field={field}
                    label={fieldLabels[key]}
                    multiline={
                      key === 'observation' ||
                      key === 'hypothesis' ||
                      key === 'change'
                    }
                    type={key === 'sampleTarget' ? 'number' : 'text'}
                    required={key !== 'buildId'}
                  />
                )}
              </form.Field>
            ))}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                {m['admin.operations.cancel']()}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending
                  ? m['admin.operations.saving']()
                  : m['admin.operations.save']()}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reviewing}
        onOpenChange={(open) => {
          if (!open) setReviewing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['admin.operations.review']()}</DialogTitle>
            <DialogDescription>{reviewing?.title}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              reviewForm.handleSubmit();
            }}
          >
            <reviewForm.Field name="result">
              {(field) => (
                <TextField
                  field={field}
                  label={m['admin.operations.result_hint']()}
                  multiline
                  required
                />
              )}
            </reviewForm.Field>
            <reviewForm.Field name="status">
              {(field) => (
                <label className="grid gap-2 text-sm">
                  <span>{m['admin.operations.conclusion']()}</span>
                  <select
                    className="border-input bg-background h-10 rounded-md border px-3"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(
                        e.target.value as 'completed' | 'stopped'
                      )
                    }
                  >
                    <option value="completed">{statusLabels.completed}</option>
                    <option value="stopped">{statusLabels.stopped}</option>
                  </select>
                </label>
              )}
            </reviewForm.Field>
            <p className="text-muted-foreground text-xs">
              {m['admin.operations.review_hint']()}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewing(null)}
              >
                {m['admin.operations.cancel']()}
              </Button>
              <Button type="submit" disabled={conclude.isPending}>
                {m['admin.operations.save']()}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
