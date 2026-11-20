import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Pencil, Plus, QrCode, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';

import { tDynamic } from '@/core/i18n/dynamic';
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  type PageResult,
} from '@/lib/api-client';
import { formatDateTime } from '@/lib/time';
import { m } from '@/paraglide/messages.js';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type Account = {
  id: string;
  channel: string;
  displayName: string;
  currency: string;
  qrImageKey: string | null;
  enabled: boolean;
  sortOrder: number;
};

type ManualOrder = {
  id: string;
  orderNo: string;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  status: string;
  amount: number;
  currency: string;
  productName?: string | null;
  createdAt: string;
  detail: {
    status: string;
    fingerprint: number;
    baseAmount: number;
    payableAmount: number;
    payerNote?: string | null;
    receiptKey?: string | null;
    submittedAt?: string | null;
    externalReference?: string | null;
    reviewNote?: string | null;
    reviewedBy?: string | null;
    observedAmount?: number | null;
    expiresAt: string;
    settledAt?: string | null;
  };
};

const PAGE_SIZE = 20;

const DETAIL_STATUSES = [
  'pending_payment',
  'pending_verification',
  'settling',
  'settled',
  'expired',
  'canceled',
  'rejected',
  'requires_refund',
] as const;

function statusVariant(status: string) {
  if (status === 'settled') return 'default' as const;
  if (status === 'rejected') return 'destructive' as const;
  if (status === 'pending_payment' || status === 'pending_verification')
    return 'secondary' as const;
  return 'outline' as const;
}

function formatCny(amount: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount / 100);
}

function ManualPaymentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountDialog, setAccountDialog] = useState<Account | 'new' | null>(
    null
  );
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [reviewing, setReviewing] = useState<ManualOrder | null>(null);
  const [refunding, setRefunding] = useState<ManualOrder | null>(null);
  const [observedAmount, setObservedAmount] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const accountsQuery = useQuery({
    queryKey: ['admin-manual-accounts'],
    queryFn: () => apiGet<Account[]>('/api/admin/manual-payments/accounts'),
  });

  const ordersQuery = useQuery({
    queryKey: ['admin-manual-orders', page, statusFilter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return apiGet<PageResult<ManualOrder>>(
        `/api/admin/manual-payments/orders?${params}`
      );
    },
    placeholderData: keepPreviousData,
  });

  const accountForm = useForm({
    defaultValues: {
      displayName: '',
      channel: 'alipay',
      currency: 'cny',
      qrImageKey: '',
      enabled: false,
      sortOrder: 0,
    },
    onSubmit: async ({ value }) => {
      if (accountDialog === 'new') {
        await createAccount.mutateAsync(value);
      } else if (accountDialog) {
        await updateAccount.mutateAsync({ id: accountDialog.id, ...value });
      }
    },
  });

  const createAccount = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost('/api/admin/manual-payments/accounts', body),
    onSuccess: () => {
      toast.success(m['admin.manual_payments.account_saved']());
      setAccountDialog(null);
      queryClient.invalidateQueries({ queryKey: ['admin-manual-accounts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAccount = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPut('/api/admin/manual-payments/accounts', body),
    onSuccess: () => {
      toast.success(m['admin.manual_payments.account_saved']());
      setAccountDialog(null);
      queryClient.invalidateQueries({ queryKey: ['admin-manual-accounts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) =>
      apiDelete(
        `/api/admin/manual-payments/accounts?id=${encodeURIComponent(id)}`
      ),
    onSuccess: () => {
      toast.success(m['admin.manual_payments.account_deleted']());
      setDeletingAccount(null);
      queryClient.invalidateQueries({ queryKey: ['admin-manual-accounts'] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeletingAccount(null);
    },
  });

  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost('/api/admin/manual-payments/orders/review', body),
    onSuccess: () => {
      toast.success(m['admin.manual_payments.order_updated']());
      setReviewing(null);
      setObservedAmount('');
      setExternalReference('');
      setReviewNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-manual-orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refund = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost('/api/admin/manual-payments/orders/refund', body),
    onSuccess: () => {
      toast.success(m['admin.manual_payments.order_updated']());
      setRefunding(null);
      queryClient.invalidateQueries({ queryKey: ['admin-manual-orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = accountsQuery.data ?? [];
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;

  function openAccountDialog(account: Account | 'new') {
    if (account === 'new') {
      accountForm.reset({
        displayName: '',
        channel: 'alipay',
        currency: 'cny',
        qrImageKey: '',
        enabled: false,
        sortOrder: accounts.length,
      });
    } else {
      accountForm.reset({
        displayName: account.displayName,
        channel: account.channel,
        currency: account.currency,
        qrImageKey: account.qrImageKey || '',
        enabled: account.enabled,
        sortOrder: account.sortOrder,
      });
    }
    setAccountDialog(account);
  }

  function openReview(order: ManualOrder) {
    setReviewing(order);
    setObservedAmount(String(order.detail.payableAmount));
    setExternalReference(order.detail.externalReference || '');
    setReviewNote('');
  }

  const orderColumns: Column<ManualOrder>[] = [
    {
      header: m['admin.manual_payments.order_no'](),
      cell: (o) => <span className="font-mono text-xs">{o.orderNo}</span>,
    },
    {
      header: m['admin.manual_payments.user'](),
      cell: (o) => (
        <div className="min-w-0">
          <span className="block truncate text-sm">
            {o.userName || o.userEmail || o.userId}
          </span>
        </div>
      ),
    },
    {
      header: m['admin.manual_payments.amount'](),
      cell: (o) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {formatCny(o.detail.payableAmount)}
          </span>
          <span className="text-muted-foreground text-xs">
            {m['admin.manual_payments.base_amount']({
              amount: formatCny(o.detail.baseAmount),
            })}
          </span>
        </div>
      ),
    },
    {
      header: m['admin.manual_payments.status'](),
      cell: (o) => (
        <Badge variant={statusVariant(o.detail.status)}>
          {tDynamic(`admin.manual_payments.status_${o.detail.status}`)}
        </Badge>
      ),
    },
    {
      header: m['admin.manual_payments.submitted_at'](),
      cell: (o) => (
        <span className="text-muted-foreground text-sm">
          {o.detail.submittedAt ? formatDateTime(o.detail.submittedAt) : '—'}
        </span>
      ),
    },
    {
      header: m['admin.manual_payments.actions'](),
      className: 'w-[160px]',
      cell: (o) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={m['admin.manual_payments.approve']()}
            aria-label={m['admin.manual_payments.approve']()}
            onClick={() => openReview(o)}
          >
            <Check className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={m['admin.manual_payments.reject']()}
            aria-label={m['admin.manual_payments.reject']()}
            onClick={() => {
              setReviewing(o);
              setObservedAmount(String(o.detail.payableAmount));
              setReviewNote('');
            }}
          >
            <X className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={m['admin.manual_payments.refund']()}
            aria-label={m['admin.manual_payments.refund']()}
            onClick={() => setRefunding(o)}
          >
            <Undo2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {m['admin.manual_payments.title']()}
        </h1>
        <p className="text-muted-foreground">
          {m['admin.manual_payments.description']()}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {m['admin.manual_payments.accounts']()}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openAccountDialog('new')}
          >
            <Plus className="size-4" />
            {m['admin.manual_payments.add_account']()}
          </Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {m['admin.manual_payments.no_accounts']()}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-row items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {account.qrImageKey ? (
                      <img
                        src={account.qrImageKey}
                        alt={account.displayName}
                        className="size-10 rounded border bg-white object-contain p-0.5"
                      />
                    ) : (
                      <span className="text-muted-foreground flex size-10 items-center justify-center rounded border">
                        <QrCode className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {account.displayName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {account.channel} · {account.currency}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={account.enabled ? 'default' : 'outline'}>
                      {account.enabled
                        ? m['admin.manual_payments.enabled']()
                        : m['admin.manual_payments.disabled']()}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openAccountDialog(account)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setDeletingAccount(account)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {m['admin.manual_payments.orders']()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={orderColumns}
            data={orders}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            rowKey={(o) => o.id}
            emptyText={m['admin.manual_payments.no_orders']()}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={m['admin.manual_payments.search_placeholder']()}
            toolbar={
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="border-input h-8 rounded-md border px-2 text-sm"
                >
                  <option value="all">
                    {m['admin.manual_payments.filter_all']()}
                  </option>
                  {DETAIL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {tDynamic(`admin.manual_payments.status_${status}`)}
                    </option>
                  ))}
                </select>
              </div>
            }
            onRefresh={() => ordersQuery.refetch()}
            loading={ordersQuery.isFetching || ordersQuery.isPending}
          />
        </CardContent>
      </Card>

      <Dialog
        open={!!accountDialog}
        onOpenChange={(open) => {
          if (!open && !createAccount.isPending && !updateAccount.isPending)
            setAccountDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accountDialog === 'new'
                ? m['admin.manual_payments.add_account']()
                : m['admin.manual_payments.edit_account']()}
            </DialogTitle>
            <DialogDescription>
              {m['admin.manual_payments.account_description']()}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              accountForm.handleSubmit();
            }}
          >
            <accountForm.Field name="displayName">
              {(field) => (
                <div className="space-y-1.5">
                  <Label>{m['admin.manual_payments.display_name']()}</Label>
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </div>
              )}
            </accountForm.Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <accountForm.Field name="channel">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label>{m['admin.manual_payments.channel']()}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              </accountForm.Field>
              <accountForm.Field name="currency">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label>{m['admin.manual_payments.currency']()}</Label>
                    <Input
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              </accountForm.Field>
            </div>
            <accountForm.Field name="qrImageKey">
              {(field) => (
                <div className="space-y-1.5">
                  <Label>{m['admin.manual_payments.qr_image']()}</Label>
                  <Input
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={m['admin.manual_payments.qr_image_hint']()}
                  />
                </div>
              )}
            </accountForm.Field>
            <div className="flex items-center justify-between">
              <Label>{m['admin.manual_payments.enabled_label']()}</Label>
              <accountForm.Field name="enabled">
                {(field) => (
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(!!checked)}
                  />
                )}
              </accountForm.Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAccountDialog(null)}
              >
                {m['admin.payments.cancel']()}
              </Button>
              <Button
                type="submit"
                disabled={createAccount.isPending || updateAccount.isPending}
              >
                {m['admin.payments.save']()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingAccount}
        title={m['admin.manual_payments.delete_account_title']()}
        description={m['admin.manual_payments.delete_account_description']()}
        confirmLabel={m['settings.apikeys.confirm_delete']()}
        cancelLabel={m['admin.payments.cancel']()}
        destructive
        onConfirm={() =>
          deletingAccount && deleteAccount.mutate(deletingAccount.id)
        }
        onCancel={() => setDeletingAccount(null)}
      />

      <Dialog
        open={!!reviewing}
        onOpenChange={(open) => {
          if (!open && !review.isPending) setReviewing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {m['admin.manual_payments.review_title']()}
            </DialogTitle>
            <DialogDescription>
              {m['admin.manual_payments.review_description']({
                orderNo: reviewing?.orderNo || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reviewing) return;
              const amount = Number(observedAmount);
              if (!Number.isInteger(amount) || amount <= 0) {
                toast.error(m['admin.manual_payments.amount_invalid']());
                return;
              }
              review.mutate({
                orderNo: reviewing.orderNo,
                action: 'approve',
                observedAmount: amount,
                externalReference: externalReference.trim() || undefined,
                reviewNote: reviewNote.trim() || undefined,
              });
            }}
          >
            <div className="space-y-1.5">
              <Label>{m['admin.manual_payments.observed_amount']()}</Label>
              <Input
                value={observedAmount}
                onChange={(event) => setObservedAmount(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {m['admin.manual_payments.payable_amount']({
                  amount: formatCny(reviewing?.detail.payableAmount || 0),
                })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{m['admin.manual_payments.external_reference']()}</Label>
              <Input
                value={externalReference}
                onChange={(event) => setExternalReference(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{m['admin.manual_payments.review_note']()}</Label>
              <Input
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewing(null)}
              >
                {m['admin.payments.cancel']()}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={review.isPending}
                onClick={() => {
                  if (!reviewing) return;
                  review.mutate({
                    orderNo: reviewing.orderNo,
                    action: 'reject',
                    reviewNote: reviewNote.trim() || undefined,
                  });
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => {
                    if (!reviewing) return;
                    review.mutate({
                      orderNo: reviewing.orderNo,
                      action: 'approve_exception',
                      observedAmount: Number(observedAmount),
                      externalReference: externalReference.trim() || undefined,
                      reviewNote: reviewNote.trim() || undefined,
                    });
                  }}
                >
                  {m['admin.manual_payments.approve_exception']()}
                </Button>
                {m['admin.manual_payments.reject']()}
              </Button>
              <Button type="submit" disabled={review.isPending}>
                {m['admin.manual_payments.approve']()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!refunding}
        title={m['admin.manual_payments.refund_title']()}
        description={m['admin.manual_payments.refund_description']({
          orderNo: refunding?.orderNo || '',
        })}
        confirmLabel={m['admin.manual_payments.refund']()}
        cancelLabel={m['admin.payments.cancel']()}
        destructive
        onConfirm={() =>
          refunding &&
          refund.mutate({
            orderNo: refunding.orderNo,
            reviewNote: reviewNote.trim() || undefined,
          })
        }
        onCancel={() => setRefunding(null)}
      />
    </div>
  );
}

export const Route = createFileRoute('/admin/manual-payments')({
  component: ManualPaymentsPage,
});
