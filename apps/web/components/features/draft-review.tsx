'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Lock, Pencil, RefreshCw, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/card';
import { Checkbox, Input, Textarea } from '@/components/ui/form';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Pill, StatusPill } from '@/components/ui/badge';
import { Avatar, Banner, QueryError } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_APPROVE_EMAIL, CAN_SEND_EMAIL, useAuth } from '@/lib/auth';
import { budgetRange, dateTime } from '@/lib/format';
import { useIntegrationStatus } from '@/hooks/queries';

/** Gmail draft approval (screen 9). Approve and Send are two separate, deliberate actions. */
export function DraftReview({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can, me } = useAuth();
  const gstatus = useIntegrationStatus();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [ideas, setIdeas] = useState<{ suggestions: string[]; source: string } | null>(null);
  const idemKey = useRef<string>('');
  const draft = useQuery({ queryKey: ['draft', id], queryFn: () => api<any>(`/communications/drafts/${id}`) });
  const lead = useQuery({ queryKey: ['lead', draft.data?.leadId], queryFn: () => api<any>(`/leads/${draft.data.leadId}`), enabled: !!draft.data?.leadId });
  const d = draft.data;
  const google = gstatus.data?.google;

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['draft', id] }); void qc.invalidateQueries({ queryKey: ['drafts'] }); void qc.invalidateQueries({ queryKey: ['approvals'] }); void qc.invalidateQueries({ queryKey: ['lead'] }); void qc.invalidateQueries({ queryKey: ['integrations-status'] }); };
  const fail = (e: unknown) => { toast.error(errorMessage(e)); refresh(); };

  const approve = useMutation({
    mutationFn: () => api<any>(`/communications/drafts/${id}/approve`, { method: 'POST', body: {} }),
    onSuccess: (r) => {
      const g = r.gmailDraft;
      if (g.state === 'CREATED') toast.success('Approved and saved as a Gmail draft. It has NOT been sent.');
      else toast.success(`Approved. ${g.message ?? 'Gmail draft not created.'}`);
      refresh();
    },
    onError: fail,
  });
  const reject = useMutation({ mutationFn: () => api(`/communications/drafts/${id}/reject`, { method: 'POST', body: {} }), onSuccess: () => { toast.success('Draft rejected.'); refresh(); }, onError: fail });
  const save = useMutation({
    mutationFn: async () => { await api(`/communications/drafts/${id}`, { method: 'PATCH', body: { subject, body } }); return api(`/communications/drafts/${id}/request-approval`, { method: 'POST' }); },
    onSuccess: () => { toast.success('Saved as a new version and resubmitted for approval.'); setEditing(false); refresh(); },
    onError: fail,
  });
  const requestApproval = useMutation({ mutationFn: () => api(`/communications/drafts/${id}/request-approval`, { method: 'POST' }), onSuccess: () => { toast.success('Submitted for approval.'); refresh(); }, onError: fail });
  const send = useMutation({
    mutationFn: () => api<any>(`/communications/drafts/${id}/send`, { method: 'POST', body: { idempotencyKey: idemKey.current, version: d.version } }),
    onSuccess: (r) => { toast.success(r.duplicate ? 'Already sent — no duplicate email was created.' : 'Email sent through Gmail.'); setConfirmOpen(false); refresh(); },
    onError: (e) => { setConfirmOpen(false); fail(e); },
  });
  const regen = useMutation({
    mutationFn: async () => { const nd = await api<any>('/communications/drafts', { method: 'POST', body: { leadId: d.leadId, generate: true } }); if (can(...CAN_APPROVE_EMAIL) && d.status === 'PENDING_REVIEW') await api(`/communications/drafts/${id}/reject`, { method: 'POST', body: { notes: 'Regenerated' } }).catch(() => undefined); return nd; },
    onSuccess: (nd) => { toast.success('New AI draft created.'); window.history.replaceState(null, '', `?draft=${nd.id}`); window.dispatchEvent(new CustomEvent('draft:select', { detail: nd.id })); refresh(); },
    onError: fail,
  });
  const suggest = useMutation({ mutationFn: () => api<any>(`/leads/${d.leadId}/suggest-reply`, { method: 'POST', body: { tone: 'warm' } }), onSuccess: setIdeas, onError: fail });

  if (draft.isError) return <QueryError error={draft.error} retry={() => draft.refetch()} />;
  if (draft.isLoading || !d) return <Skeleton className="h-[520px]" />;

  const startEdit = () => { setSubject(d.subject); setBody(d.body); setEditing(true); };
  const blocked = !google?.connected;
  const l = lead.data;
  const approverView = can(...CAN_APPROVE_EMAIL);
  const canSend = can(...CAN_SEND_EMAIL);
  const consentOk = d.consentStatus === 'GRANTED';

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
      <Panel>
        <PanelHeader title="Email Draft" description={d.aiGenerated ? (d.aiSource === 'LLM' ? 'AI generated — review every word before approving' : 'Generated by the demo template engine (no AI key configured)') : 'Written by a team member'} action={<div className="flex flex-wrap items-center gap-2"><StatusPill status={d.status} /><Pill tone="muted">v{d.version}</Pill></div>} />
        <div className="space-y-4 p-5">
          {d.status === 'PENDING_REVIEW' && <Banner tone="warn" title="Pending review">This message has not been approved. {approverView ? 'Approving saves it as a Gmail draft — it still will not be sent.' : 'An owner or manager must approve it.'}</Banner>}
          {d.status === 'APPROVED' && <Banner tone="info" title={`Approved (version ${d.approvedVersion}) — not sent`}>Sending is a separate step. Editing this message will invalidate the approval.</Banner>}
          {d.status === 'DRAFT' && <Banner tone="warn" title="Needs approval again">This draft was edited, so any earlier approval no longer applies.</Banner>}
          {d.status === 'REJECTED' && <Banner tone="error" title="Rejected">{d.lastError ?? 'This draft was rejected and cannot be sent.'}</Banner>}
          {d.status === 'SEND_FAILED' && <Banner tone="error" title="Send failed — nothing was delivered">{d.lastError}</Banner>}
          {d.status === 'SENT' && <Banner tone="info" title="Sent through Gmail">Sent {dateTime(d.sentAt)} · Gmail message id <code className="rounded bg-ink/10 px-1">{d.providerMessageId}</code></Banner>}
          {!consentOk && !['SENT'].includes(d.status) && <Banner tone="error" title="Consent missing">This contact has not granted (or has withdrawn) consent. Sending is blocked.</Banner>}

          <div><label className="mb-1 block text-[13px] font-medium" htmlFor="d-to">To</label><Input id="d-to" readOnly value={d.recipient} className="bg-cream/60" /></div>
          <div><label className="mb-1 block text-[13px] font-medium" htmlFor="d-sub">Subject</label><Input id="d-sub" readOnly={!editing} value={editing ? subject : d.subject} onChange={(e) => setSubject(e.target.value)} className={editing ? '' : 'bg-cream/60'} /></div>
          <div><label className="mb-1 block text-[13px] font-medium" htmlFor="d-body">Body</label><Textarea id="d-body" readOnly={!editing} value={editing ? body : d.body} onChange={(e) => setBody(e.target.value)} className={`min-h-[300px] leading-relaxed ${editing ? '' : 'bg-cream/60'}`} /></div>
          {editing && d.status === 'APPROVED' && <Banner tone="warn">Saving creates version {d.version + 1} and withdraws the current approval.</Banner>}

          <div className="flex flex-wrap items-center gap-2 border-t border-gold/25 pt-4">
            {editing ? (<><Button loading={save.isPending} disabled={subject.trim().length < 2 || body.trim().length < 2} onClick={() => save.mutate()}>Save &amp; resubmit for approval</Button><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button></>) : (<>
              {d.status === 'PENDING_REVIEW' && approverView && <Button loading={approve.isPending} disabled={!consentOk} onClick={() => approve.mutate()}>Approve &amp; Save to Gmail Draft</Button>}
              {d.status === 'DRAFT' && <Button loading={requestApproval.isPending} onClick={() => requestApproval.mutate()}>Submit for approval</Button>}
              {d.status === 'REJECTED' && <Button variant="outline" onClick={startEdit}><Pencil className="h-4 w-4" />Revise draft</Button>}
              {['APPROVED', 'SEND_FAILED'].includes(d.status) && d.approvedVersion === d.version && canSend && (
                <Button disabled={blocked || !consentOk} onClick={() => { idemKey.current = crypto.randomUUID(); setConfirmed(false); setConfirmOpen(true); }}><Send className="h-4 w-4" />{d.status === 'SEND_FAILED' ? 'Retry send…' : 'Confirm & Send…'}</Button>
              )}
              {['PENDING_REVIEW', 'APPROVED', 'DRAFT', 'SEND_FAILED'].includes(d.status) && can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE') && <Button variant="outline" onClick={startEdit}><Pencil className="h-4 w-4" />Edit Draft</Button>}
              {d.status === 'PENDING_REVIEW' && approverView && <Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>Reject</Button>}
              {['PENDING_REVIEW', 'DRAFT', 'REJECTED'].includes(d.status) && d.aiGenerated && can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE') && <Button variant="ghost" loading={regen.isPending} onClick={() => regen.mutate()}><RefreshCw className="h-4 w-4" />Regenerate with AI</Button>}
            </>)}
          </div>
          {['APPROVED', 'SEND_FAILED'].includes(d.status) && blocked && (
            <Banner tone="warn" title="Sending is blocked: Gmail is not connected">{google?.blockedReason ?? 'Connect a Google account'} <Link className="font-semibold text-royal underline" href="/settings">Open Settings</Link></Banner>
          )}
        </div>
      </Panel>

      <aside className="min-w-0 space-y-5" aria-label="Lead context">
        <Panel>
          <PanelHeader title="Lead Context" />
          <div className="space-y-3 p-5 text-sm">
            {lead.isLoading ? <Skeleton className="h-28" /> : l && (<>
              <div className="flex items-center gap-3"><Avatar name={l.contact.name} className="h-11 w-11" /><div><Link href={`/leads/${l.id}`} className="font-display text-base font-semibold hover:text-royal">{l.contact.name}</Link><p className="text-xs text-ink-muted">{l.productInterest ?? 'General enquiry'}</p></div></div>
              <dl className="space-y-1.5 text-[13px]"><div className="flex justify-between gap-3"><dt className="text-ink-muted">Budget</dt><dd className="font-medium">{budgetRange(l.budgetMin, l.budgetMax, me?.tenant.currency)}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-muted">Timeline</dt><dd className="font-medium">{l.purchaseTimeline ?? '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-muted">Score</dt><dd className="font-medium">{l.leadScore ?? '—'}/100</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-muted">Consent</dt><dd className="font-medium capitalize">{l.contact.consentStatus.replace('_', ' ').toLowerCase()}</dd></div></dl>
            </>)}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="AI Suggestions" action={<Button size="sm" variant="outline" loading={suggest.isPending} onClick={() => suggest.mutate()}><Sparkles className="h-3.5 w-3.5" />Suggest</Button>} />
          <div className="p-5 text-sm">
            {ideas ? <ul className="list-disc space-y-1.5 pl-4">{ideas.suggestions.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="flex items-start gap-2 text-ink-muted"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" />Ask for ideas on tone, offers to avoid, and next steps. Suggestions are internal and never sent.</p>}
            {ideas?.source !== undefined && ideas.source !== 'LLM' && <Pill tone="gold" className="mt-3">Demo simulation</Pill>}
          </div>
        </Panel>
        <Panel className="p-5 text-xs text-ink-muted"><p className="flex items-start gap-2"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-deep" />Approval is bound to the exact version you reviewed. Send is verified again on the server against approval, consent, recipient and Gmail connection.</p></Panel>
      </aside>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Send this email now?" description="This will deliver the approved message through the connected Gmail account.">
          <dl className="space-y-2 rounded-xl border border-gold/40 bg-cream/60 p-4 text-sm"><div className="flex gap-3"><dt className="w-20 text-ink-muted">From</dt><dd className="font-medium">{google?.accountIdentifier ?? '—'}</dd></div><div className="flex gap-3"><dt className="w-20 text-ink-muted">To</dt><dd className="font-medium">{d.recipient}</dd></div><div className="flex gap-3"><dt className="w-20 text-ink-muted">Subject</dt><dd className="font-medium">{d.subject}</dd></div><div className="flex gap-3"><dt className="w-20 text-ink-muted">Version</dt><dd className="font-medium">v{d.version} (approved)</dd></div></dl>
          {google?.desiredSender && google.connectedAccountMatchesDesiredSender === false && <Banner tone="warn" className="mt-3">The connected account differs from the intended sender ({google.desiredSender}).</Banner>}
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm"><Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have reviewed this exact message and I want it sent to {d.recipient}.</label>
          <div className="mt-5 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button disabled={!confirmed} loading={send.isPending} onClick={() => send.mutate()}><Send className="h-4 w-4" />Send email</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
