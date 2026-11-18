import { IconMessage2, IconPlus, IconTicket } from '@tabler/icons-react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { LocalDateTime } from '@/components/local-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { getRequestLocale } from '@/lib/locale'
import { assertAdminRole, assertFeatureEnabled } from '@/lib/module-access'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { fetchAdminTicketsAndInvites, saveAdminInviteCode } from '@/modules/invite-codes/service'
import {
  type AdminTicketItem,
  createAdminTicket,
  updateAdminTicket,
} from '@/modules/tickets/service'

export const Route = createFileRoute('/{-$locale}/_layout/admin/tickets')({
  beforeLoad: ({ context }) => {
    assertFeatureEnabled('enableAdmin')
    assertAdminRole(context.session.user.role)
  },
  loader: () => fetchAdminTicketsAndInvites(),
  head: () =>
    seo('/admin/tickets', {
      title: m.admin_tickets_title(),
      description: m.admin_tickets_description(),
      locale: getRequestLocale(),
      noindex: true,
    }),
  component: AdminTicketsPage,
})

function AdminTicketsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const locale = getRequestLocale()

  const [createTicketOpen, setCreateTicketOpen] = useState(false)
  const [createInviteOpen, setCreateInviteOpen] = useState(false)
  const [replyingTicket, setReplyingTicket] = useState<AdminTicketItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // New ticket state
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')

  // Reply state
  const [replyText, setReplyText] = useState('')

  // Invite state
  const [inviteCode, setInviteCode] = useState('')
  const [bonusCredits, setBonusCredits] = useState('50')
  const [maxUses, setMaxUses] = useState('10')

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await createAdminTicket({
        data: {
          subject: subject.trim(),
          category: 'billing',
          priority: 'normal',
          content: content.trim(),
        },
      })
      toast.add({ type: 'success', title: m.admin_tickets_saved_toast() })
      setCreateTicketOpen(false)
      setSubject('')
      setContent('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReplyTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!replyingTicket || submitting) return
    setSubmitting(true)
    try {
      await updateAdminTicket({
        data: {
          ticketId: replyingTicket.id,
          adminReply: replyText.trim(),
          status: 'replied',
        },
      })
      toast.add({ type: 'success', title: m.admin_tickets_saved_toast() })
      setReplyingTicket(null)
      setReplyText('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseTicket(ticketId: string) {
    try {
      await updateAdminTicket({
        data: {
          ticketId,
          status: 'closed',
        },
      })
      toast.add({ type: 'success', title: m.admin_tickets_saved_toast() })
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await saveAdminInviteCode({
        data: {
          code: inviteCode.trim().toUpperCase(),
          bonusCredits: Math.max(0, Number.parseInt(bonusCredits, 10) || 0),
          maxUses: Math.max(1, Number.parseInt(maxUses, 10) || 1),
        },
      })
      toast.add({ type: 'success', title: m.admin_tickets_saved_toast() })
      setCreateInviteOpen(false)
      setInviteCode('')
      await router.invalidate()
    } catch {
      toast.add({ type: 'error', title: m.settings_error_generic() })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{m.admin_tickets_title()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.admin_tickets_description()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCreateInviteOpen(true)}
            data-testid="create-invite-button"
          >
            <IconPlus className="mr-1.5 size-4" />
            {m.admin_tickets_create_invite()}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateTicketOpen(true)}
            data-testid="create-ticket-button"
          >
            <IconPlus className="mr-1.5 size-4" />
            {m.admin_tickets_create_ticket()}
          </Button>
        </div>
      </div>

      {/* 客服工单 */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">{m.admin_tickets_section_tickets()}</h3>
        {data.tickets.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconMessage2 className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{m.admin_tickets_empty_tickets()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.admin_tickets_col_created_at()}</TableHead>
                  <TableHead>{m.admin_tickets_col_user()}</TableHead>
                  <TableHead>{m.admin_tickets_col_subject()}</TableHead>
                  <TableHead>{m.admin_tickets_col_priority()}</TableHead>
                  <TableHead>{m.admin_tickets_col_status()}</TableHead>
                  <TableHead className="text-right">{m.admin_tickets_col_actions()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tickets.map((tkt) => (
                  <TableRow key={tkt.id} data-testid={`ticket-row-${tkt.id}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <LocalDateTime value={tkt.createdAt} locale={locale} />
                    </TableCell>
                    <TableCell className="text-sm">{tkt.userEmail ?? tkt.userId}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{tkt.subject}</div>
                        <div className="text-xs text-muted-foreground">{tkt.content}</div>
                        {tkt.adminReply ? (
                          <div className="rounded bg-muted px-2 py-1 text-xs">{tkt.adminReply}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tkt.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tkt.status === 'closed' ? 'outline' : 'default'}>
                        {tkt.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {tkt.status !== 'closed' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReplyingTicket(tkt)
                              setReplyText(tkt.adminReply ?? '')
                            }}
                            data-testid={`reply-ticket-${tkt.id}`}
                          >
                            {m.admin_tickets_reply()}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCloseTicket(tkt.id)}
                            data-testid={`close-ticket-${tkt.id}`}
                          >
                            {m.admin_tickets_close()}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* 邀请码管理 */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">{m.admin_tickets_section_invites()}</h3>
        {data.inviteCodes.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconTicket className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{m.admin_tickets_empty_invites()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.admin_tickets_invite_col_code()}</TableHead>
                  <TableHead>{m.admin_tickets_invite_col_bonus()}</TableHead>
                  <TableHead>{m.admin_tickets_invite_col_usage()}</TableHead>
                  <TableHead>{m.admin_tickets_invite_col_status()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.inviteCodes.map((inv) => (
                  <TableRow key={inv.id} data-testid={`invite-row-${inv.code}`}>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {inv.code}
                      </code>
                    </TableCell>
                    <TableCell className="font-mono text-sm">+{inv.bonusCredits}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {inv.usedCount} / {inv.maxUses}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* 新建工单 Dialog */}
      <Dialog open={createTicketOpen} onOpenChange={setCreateTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_tickets_create_ticket()}</DialogTitle>
            <DialogDescription>{m.admin_tickets_description()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-subject">{m.admin_tickets_field_subject()}</Label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                data-testid="ticket-subject-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-content">{m.admin_tickets_field_content()}</Label>
              <Input
                id="ticket-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                data-testid="ticket-content-input"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_tickets_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="save-ticket-submit">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_tickets_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 回复工单 Dialog */}
      <Dialog
        open={replyingTicket !== null}
        onOpenChange={(open) => {
          if (!open) setReplyingTicket(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_tickets_reply()}</DialogTitle>
            <DialogDescription>{replyingTicket?.subject}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReplyTicket} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-reply">{m.admin_tickets_field_reply()}</Label>
              <Input
                id="ticket-reply"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                required
                data-testid="ticket-reply-input"
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_tickets_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="submit-ticket-reply">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_tickets_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 新建邀请码 Dialog */}
      <Dialog open={createInviteOpen} onOpenChange={setCreateInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.admin_tickets_create_invite()}</DialogTitle>
            <DialogDescription>{m.admin_tickets_description()}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-code">{m.admin_tickets_field_code()}</Label>
              <Input
                id="invite-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                data-testid="invite-code-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-bonus">{m.admin_tickets_field_bonus_credits()}</Label>
                <Input
                  id="invite-bonus"
                  type="number"
                  min={0}
                  max={10000}
                  value={bonusCredits}
                  onChange={(e) => setBonusCredits(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-max">{m.admin_tickets_field_max_uses()}</Label>
                <Input
                  id="invite-max"
                  type="number"
                  min={1}
                  max={10000}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {m.admin_tickets_cancel()}
              </DialogClose>
              <Button type="submit" disabled={submitting} data-testid="save-invite-submit">
                {submitting ? <Spinner className="mr-1.5 size-4" /> : null}
                {m.admin_tickets_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
