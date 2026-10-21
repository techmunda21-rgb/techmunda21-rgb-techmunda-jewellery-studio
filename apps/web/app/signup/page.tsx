'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { POLICY_VERSION, signupStartSchema } from '@techmunda/shared';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Banner } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { GoldDivider, Logo, LogoMark, Motif } from '@/components/brand/brand';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

type Values = z.input<typeof signupStartSchema>;
interface Pending { requestId: string; channel: 'EMAIL' | 'SMS'; sentTo: string; resendAfterSeconds: number }

export default function SignupPage() {
  const router = useRouter();
  const { adoptSession, me } = useAuth();
  const cfg = useQuery({ queryKey: ['signup-config'], queryFn: () => api<any>('/public/signup/config', { auth: false }), retry: false });
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(signupStartSchema),
    defaultValues: { country: 'IN', channel: 'EMAIL', marketingOptIn: false, policyVersion: POLICY_VERSION, acceptTerms: false as any, acceptPrivacy: false as any },
  });
  const channel = watch('channel');
  const channels: string[] = cfg.data?.channels ?? [];

  useEffect(() => { if (me) router.replace('/overview'); }, [me, router]);
  useEffect(() => { if (channels.length && !channels.includes(channel)) setValue('channel', channels[0] as 'EMAIL' | 'SMS'); }, [channels, channel, setValue]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const start = handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api<Pending>('/public/signup/start', { method: 'POST', auth: false, body: { ...v, policyVersion: POLICY_VERSION } });
      setPending(r); setCode(''); setWait(r.resendAfterSeconds);
    } catch (e) { setError(errorMessage(e)); }
  });

  async function verify() {
    if (!pending) return;
    setError(null); setBusy(true);
    try {
      const t = await api<{ accessToken: string; refreshToken: string }>('/public/signup/verify', { method: 'POST', auth: false, body: { requestId: pending.requestId, code } });
      await adoptSession(t);
      router.replace('/overview');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function resend() {
    if (!pending) return;
    setError(null);
    try { const r = await api<{ resendAfterSeconds: number }>('/public/signup/resend', { method: 'POST', auth: false, body: { requestId: pending.requestId } }); setWait(r.resendAfterSeconds); setCode(''); }
    catch (e) { setError(errorMessage(e)); }
  }

  return (
    <main id="main" className="motif-bg relative flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <Motif className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 opacity-30" />
      <div className="relative w-full max-w-xl">
        <div className="mb-6 flex justify-center"><Logo tone="dark" /></div>
        <div className="panel p-6 sm:p-9">
          <div className="mb-5 text-center">
            <LogoMark className="mx-auto mb-2 h-10 w-10" />
            <h1 className="font-display text-2xl font-semibold">{pending ? 'Verify your details' : 'Create your demo workspace'}</h1>
            <p className="mt-1 text-sm text-ink-muted">{pending ? `Enter the 6-digit code we sent to ${pending.sentTo}.` : 'Free demo · verified by one-time code · data auto-deleted after 30 days.'}</p>
          </div>

          {cfg.isLoading ? <Skeleton className="h-64" /> : cfg.data && !cfg.data.enabled ? (
            <Banner tone="warn" title="Signup is not available right now">{cfg.data.blockedReason} Please contact <a className="font-semibold text-royal underline" href="mailto:techmunda21@gmail.com?subject=Demo%20access">techmunda21@gmail.com</a> for a demo login.</Banner>
          ) : cfg.isError ? <Banner tone="error" title="Could not reach the server">Please try again in a moment.</Banner> : pending ? (
            <form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="space-y-4" noValidate>
              {error && <Banner tone="error">{error}</Banner>}
              <div>
                <label htmlFor="otp" className="mb-1.5 block text-[13px] font-medium">Verification code</label>
                <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus aria-describedby="otp-help"
                  className="field text-center font-display text-3xl tracking-[0.5em]" placeholder="••••••" />
                <p id="otp-help" className="mt-1.5 text-xs text-ink-muted">The code expires in 10 minutes. Never share it with anyone.</p>
              </div>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>Verify &amp; create workspace</Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setPending(null); setError(null); }} className="font-medium text-royal hover:underline">← Change details</button>
                <button type="button" onClick={resend} disabled={wait > 0} className="font-medium text-royal hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline">{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={start} noValidate className="grid gap-4 sm:grid-cols-2">
              {error && <Banner tone="error" className="sm:col-span-2">{error}</Banner>}
              <Field label="Your full name" htmlFor="fullName" error={errors.fullName?.message} required><Input id="fullName" autoComplete="name" {...register('fullName')} /></Field>
              <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message} required><Input id="businessName" autoComplete="organization" placeholder="Your jewellery business" {...register('businessName')} /></Field>
              <Field label="E-mail" htmlFor="email" error={errors.email?.message} required><Input id="email" type="email" autoComplete="email" {...register('email')} /></Field>
              <Field label="Mobile number" htmlFor="phone" error={errors.phone?.message} required hint="International format"><Input id="phone" type="tel" autoComplete="tel" placeholder="+919876543210" {...register('phone')} /></Field>
              <Field label="Country" htmlFor="country"><Select id="country" {...register('country')}><option value="IN">India</option><option value="AE">United Arab Emirates</option><option value="OTHER">Other</option></Select></Field>
              <Field label="Password" htmlFor="password" error={errors.password?.message} required hint="10+ characters with a letter and a number">
                <div className="relative"><Input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" className="pr-10" {...register('password')} />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gold-deep hover:bg-gold/15">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
              </Field>

              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-[13px] font-medium">Send my one-time code by</legend>
                <div className="grid grid-cols-2 gap-3">
                  {([['EMAIL', 'E-mail (Gmail etc.)', Mail], ['SMS', 'Mobile SMS', Smartphone]] as const).map(([k, label, Icon]) => {
                    const on = channels.includes(k);
                    return (
                      <label key={k} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 py-3 text-sm font-medium transition', channel === k ? 'border-royal bg-royal/5' : 'border-gold/45 hover:border-gold', !on && 'cursor-not-allowed opacity-45')}>
                        <input type="radio" value={k} disabled={!on} className="accent-[rgb(var(--royal))]" {...register('channel')} /><Icon className="h-4 w-4 text-gold-deep" aria-hidden />{label}{!on && <span className="ml-auto text-[10px] font-normal">unavailable</span>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <GoldDivider className="sm:col-span-2" />
              <div className="space-y-3 sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px]"><Checkbox aria-describedby="terms-error" {...register('acceptTerms')} /><span>I have read and accept the <Link className="font-semibold text-royal underline" href="/legal/terms" target="_blank">Terms of Demo Use</Link>.</span></label>
                {errors.acceptTerms && <p id="terms-error" role="alert" className="text-xs font-medium text-status-rejected">{errors.acceptTerms.message}</p>}
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px]"><Checkbox aria-describedby="privacy-error" {...register('acceptPrivacy')} /><span>I have read the <Link className="font-semibold text-royal underline" href="/legal/privacy" target="_blank">Privacy Policy</Link> and agree to my data being processed as described, including auto-deletion after 30 days.</span></label>
                {errors.acceptPrivacy && <p id="privacy-error" role="alert" className="text-xs font-medium text-status-rejected">{errors.acceptPrivacy.message}</p>}
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-muted"><Checkbox {...register('marketingOptIn')} /><span>(Optional) Send me news and offers from Techmunda. You can withdraw this at any time.</span></label>
              </div>
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" {...register('website')} /></label></div>
              <Button type="submit" size="lg" className="w-full sm:col-span-2" loading={isSubmitting}>Send verification code →</Button>
              <p className="flex items-start gap-2 text-xs text-ink-muted sm:col-span-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-deep" aria-hidden /><span><Lock className="mr-1 inline h-3 w-3" aria-hidden />We store your password only as a hash. Do not enter card, ID or health data. Use synthetic or low-risk data in this demo.</span></p>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-ink-muted">Already have access? <Link href="/login" className="font-semibold text-royal hover:underline">Sign in</Link></p>
      </div>
    </main>
  );
}
