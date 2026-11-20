import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Clock, Loader2, QrCode, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Link } from '@/core/i18n/navigation';
import { apiGet } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type DetailStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'settling'
  | 'settled'
  | 'expired'
  | 'canceled'
  | 'rejected'
  | 'requires_refund';

type ManualOrder = {
  orderNo: string;
  status: string;
  amount: number;
  currency: string;
  productName?: string | null;
  planName?: string | null;
  createdAt: string;
  paidAt?: string | null;
  detail: {
    status: DetailStatus;
    fingerprint: number;
    baseAmount: number;
    payableAmount: number;
    payerNote?: string | null;
    receiptKey?: string | null;
    submittedAt?: string | null;
    expiresAt: string;
    settledAt?: string | null;
    reviewNote?: string | null;
  };
  account: {
    displayName: string;
    channel: string;
    qrImageUrl: string | null;
  } | null;
};

const STATUS_VARIANT: Record<
  DetailStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_payment: 'secondary',
  pending_verification: 'secondary',
  settling: 'secondary',
  settled: 'default',
  expired: 'outline',
  canceled: 'outline',
  rejected: 'destructive',
  requires_refund: 'outline',
};

function formatCny(amount: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount / 100);
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ManualPaymentPage() {
  const { orderNo } = Route.useParams();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const query = useQuery({
    queryKey: ['manual-payment', orderNo],
    queryFn: () =>
      apiGet<ManualOrder>(`/api/user/orders/${encodeURIComponent(orderNo)}`),
    // The countdown and the review status both change without the user
    // acting, so the page keeps itself fresh.
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const order = query.data;
  const expiresAt = order ? new Date(order.detail.expiresAt).getTime() : 0;
  const remaining = useMemo(() => expiresAt - now, [expiresAt, now]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(m['manual_payment.no_file']());
      const form = new FormData();
      form.set('order_no', orderNo);
      form.set('file', file);
      if (note.trim()) form.set('payer_note', note.trim());
      const response = await fetch('/api/payment/manual/receipt', {
        method: 'POST',
        body: form,
      });
      const json = (await response.json().catch(() => ({
        code: -1,
        message: response.statusText || 'Upload failed',
      }))) as { code: number; message: string };
      if (json.code !== 0) throw new Error(json.message || 'Upload failed');
    },
    onSuccess: () => {
      toast.success(m['manual_payment.upload_success']());
      setFile(null);
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['manual-payment', orderNo] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (query.isError || !order) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-bold">{m['manual_payment.title']()}</h1>
        <Card>
          <CardContent className="space-y-4 py-6">
            <p className="text-muted-foreground text-sm">
              {m['manual_payment.not_found']()}
            </p>
            <Link
              href="/settings/payments"
              className={buttonVariants({ variant: 'outline' })}
            >
              {m['manual_payment.back_to_payments']()}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = order.detail.status;
  const awaiting = status === 'pending_payment';
  const expired = status === 'expired' || (awaiting && remaining <= 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['manual_payment.title']()}</h1>
        <p className="text-muted-foreground">
          {m['manual_payment.description']()}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {order.productName || order.planName || order.orderNo}
          </CardTitle>
          <Badge variant={STATUS_VARIANT[status]}>
            {m[`manual_payment.status_${status}`]()}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">
                {m['manual_payment.order_no']()}
              </Label>
              <p className="font-mono text-sm">{order.orderNo}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">
                {m['manual_payment.payable_amount']()}
              </Label>
              <p className="text-lg font-semibold">
                {formatCny(order.detail.payableAmount)}
              </p>
              {order.detail.fingerprint > 0 && (
                <p className="text-muted-foreground text-xs">
                  {m['manual_payment.fingerprint_hint']({
                    amount: formatCny(order.detail.baseAmount),
                  })}
                </p>
              )}
            </div>
          </div>

          {awaiting && !expired && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="size-4" />
              <span>{m['manual_payment.expires_in']()}</span>
              <span className="font-mono font-medium">
                {formatCountdown(remaining)}
              </span>
            </div>
          )}

          {expired && (
            <div className="space-y-3 rounded-md border border-dashed p-4">
              <p className="text-sm">
                {m['manual_payment.expired_description']()}
              </p>
              <Link
                href="/pricing"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {m['manual_payment.reorder']()}
              </Link>
            </div>
          )}

          {status === 'pending_verification' && (
            <div className="space-y-2 rounded-md border p-4">
              <p className="text-sm font-medium">
                {m['manual_payment.waiting_verification']()}
              </p>
              <p className="text-muted-foreground text-sm">
                {m['manual_payment.waiting_verification_desc']()}
              </p>
            </div>
          )}

          {status === 'settled' && (
            <div className="space-y-2 rounded-md border p-4">
              <p className="text-sm font-medium">
                {m['manual_payment.settled_description']()}
              </p>
              {order.detail.reviewNote && (
                <p className="text-muted-foreground text-sm">
                  {order.detail.reviewNote}
                </p>
              )}
            </div>
          )}

          {status === 'rejected' && (
            <div className="border-destructive/40 space-y-2 rounded-md border p-4">
              <p className="text-sm font-medium">
                {m['manual_payment.rejected_description']()}
              </p>
              {order.detail.reviewNote && (
                <p className="text-muted-foreground text-sm">
                  {order.detail.reviewNote}
                </p>
              )}
            </div>
          )}

          {awaiting && !expired && (
            <>
              <div className="space-y-3">
                <Label>{m['manual_payment.payee']()}</Label>
                {order.account?.qrImageUrl ? (
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <img
                      src={order.account.qrImageUrl}
                      alt={m['manual_payment.payee']()}
                      className="h-40 w-40 rounded-md border bg-white object-contain p-1"
                    />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{order.account.displayName}</p>
                      <p className="text-muted-foreground">
                        {m['manual_payment.scan_to_pay']()}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <QrCode className="size-4" />
                    {order.account?.displayName ||
                      m['manual_payment.payee_missing']()}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  {m['manual_payment.payment_instructions']()}
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  upload.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="manual-receipt-file">
                    {m['manual_payment.upload_receipt']()}
                  </Label>
                  <Input
                    id="manual-receipt-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    ref={fileRef}
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    {m['manual_payment.upload_hint']()}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-receipt-note">
                    {m['manual_payment.payer_note']()}
                  </Label>
                  <Textarea
                    id="manual-receipt-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={m['manual_payment.payer_note_placeholder']()}
                    rows={3}
                  />
                </div>

                <Button type="submit" disabled={upload.isPending || !file}>
                  {upload.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {m['manual_payment.submit']()}
                </Button>
              </form>
            </>
          )}

          <Link
            href="/settings/payments"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {m['manual_payment.back_to_payments']()}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/settings/payments/$orderNo')({
  component: ManualPaymentPage,
});
