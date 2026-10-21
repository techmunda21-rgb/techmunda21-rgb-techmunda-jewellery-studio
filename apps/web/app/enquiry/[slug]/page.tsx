'use client';
import { use, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Award, CheckCircle2, Crown, Lock, Sparkles } from 'lucide-react';
import { publicLeadSchema } from '@techmunda/shared';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Banner } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { GoldDivider, Motif } from '@/components/brand/brand';
import { api, errorMessage } from '@/lib/api';

type Values = z.input<typeof publicLeadSchema>;
const BENEFITS = [
  { icon: Crown, label: 'Exclusive Collections' },
  { icon: Award, label: 'Certified Jewellery' },
  { icon: Sparkles, label: 'Personal Consultation' },
  { icon: Lock, label: 'Secure & Private' },
];
const CATEGORIES = ['Necklace', 'Bangles', 'Bridal Set', 'Earrings', 'Ring', 'Mangalsutra', 'Custom Design', 'Other'];
const BUDGETS = ['Under ₹1 lakh', '₹1L – ₹3L', '₹3L – ₹5L', '₹5L – ₹10L', '₹10L – ₹15L', '₹15L – ₹25L', 'Above ₹25 lakh'];
const TIMELINES = ['Within 1 month', '1-3 months', '3-6 months', '6+ months', 'Just browsing'];

export default function EnquiryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const startedAt = useRef(Date.now());
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tenant = useQuery({ queryKey: ['public-tenant', slug], queryFn: () => api<any>(`/public/tenants/${slug}`, { auth: false }), retry: false });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(publicLeadSchema), defaultValues: { tenantSlug: slug, consent: false as any } });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries({ ...v, tenantSlug: slug, formStartedAt: startedAt.current }).filter(([, x]) => x !== '' && x !== undefined));
      await api('/public/leads', { method: 'POST', body, auth: false });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const name = tenant.data?.name ?? 'our jewellers';
  return (
    <main id="main" className="grid min-h-screen bg-cream lg:grid-cols-[1fr_1.05fr]">
      <section className="relative min-h-[420px] overflow-hidden bg-maroon-deep text-maroon-foreground lg:min-h-screen">
        <div className="absolute inset-x-0 top-0 h-[58%]">
          <img src="/images/model-modern.jpg" alt="Model wearing an emerald and diamond necklace and earrings" className="h-full w-full object-cover object-[50%_45%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-deep via-maroon-deep/10 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-maroon-deep/80 to-transparent" aria-hidden />
        </div>
        <Motif className="pointer-events-none absolute -right-28 -top-28 h-[360px] w-[360px] opacity-20" />
        <div className="relative z-10 flex min-h-[420px] flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen lg:px-14 lg:py-10">
          <div className="flex items-center gap-2"><span className="font-editorial text-2xl tracking-wide">{tenant.isLoading ? '' : name}</span></div>
          <div className="max-w-lg pt-52 lg:pt-0">
            <h1 className="font-editorial text-[42px] font-semibold leading-[1.05] text-ivory sm:text-6xl">Find Your Perfect Jewellery</h1>
            <p className="mt-4 text-lg text-maroon-foreground/90">Book a personalized consultation with our jewellery experts.</p>
            <GoldDivider className="my-6 max-w-xs" />
            <ul className="grid gap-3 sm:grid-cols-2">{BENEFITS.map(({ icon: I, label }) => <li key={label} className="flex items-center gap-3 text-sm"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/70 bg-maroon-deep/60 text-gold"><I className="h-4 w-4" aria-hidden /></span>{label}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="motif-bg flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-xl">
          {tenant.isError ? (
            <Banner tone="error" title="This enquiry page is not available">Please check the link you were given, or contact the jeweller directly.</Banner>
          ) : done ? (
            <div className="panel p-10 text-center" role="status">
              <CheckCircle2 className="mx-auto h-12 w-12 text-status-approved" aria-hidden />
              <h2 className="mt-4 font-display text-2xl font-semibold">Thank you</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">Your enquiry has been received. A member of our team will contact you shortly using the details you provided.</p>
            </div>
          ) : (
            <div className="panel p-6 sm:p-8">
              <h2 className="font-display text-2xl font-semibold">Enquiry Form</h2>
              <p className="mb-5 mt-1 text-sm text-ink-muted">Tell us what you are looking for — we’ll take it from there.</p>
              {tenant.isLoading && <Skeleton className="mb-4 h-8" />}
              {error && <Banner tone="error" className="mb-4">{error}</Banner>}
              <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" htmlFor="name" error={errors.name?.message} required className="sm:col-span-2"><Input id="name" autoComplete="name" placeholder="Your full name" aria-invalid={!!errors.name} {...register('name')} /></Field>
                <Field label="Phone Number" htmlFor="phone" error={errors.phone?.message}><Input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" {...register('phone')} /></Field>
                <Field label="Email" htmlFor="email" error={errors.email?.message as string}><Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} /></Field>
                <p className="-mt-2 text-xs text-ink-muted sm:col-span-2">Provide at least a phone number or an email address.</p>
                <Field label="Product Interest" htmlFor="productInterest" error={errors.productInterest?.message}><Select id="productInterest" {...register('productInterest')} defaultValue=""><option value="">Select product category</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Budget Range" htmlFor="budgetRange"><Select id="budgetRange" {...register('budgetRange')} defaultValue=""><option value="">Select budget range</option>{BUDGETS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Preferred Metal or Gemstone" htmlFor="preferredMaterial"><Input id="preferredMaterial" placeholder="e.g. 22K gold, diamond, emerald" {...register('preferredMaterial')} /></Field>
                <Field label="Purchase Timeline" htmlFor="purchaseTimeline"><Select id="purchaseTimeline" {...register('purchaseTimeline')} defaultValue=""><option value="">Select timeline</option>{TIMELINES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Preferred Appointment Date" htmlFor="appointmentDate" error={errors.appointmentDate?.message as string} className="sm:col-span-2"><Input id="appointmentDate" type="date" min={new Date().toISOString().slice(0, 10)} {...register('appointmentDate')} /></Field>
                <Field label="Message" htmlFor="message" error={errors.message?.message} className="sm:col-span-2"><Textarea id="message" placeholder="Tell us about your requirements…" {...register('message')} /></Field>
                {/* honeypot: hidden from people and assistive tech, bots fill it in */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" {...register('website')} /></label></div>
                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-start gap-2.5 text-[13px]"><Checkbox aria-describedby="consent-error" {...register('consent')} /><span>{tenant.data?.consentText ?? 'I agree to be contacted about my enquiry.'}</span></label>
                  {errors.consent && <p id="consent-error" role="alert" className="mt-1 text-xs font-medium text-status-rejected">{errors.consent.message as string}</p>}
                </div>
                <Button type="submit" size="lg" className="w-full sm:col-span-2" loading={isSubmitting} disabled={tenant.isLoading}>Submit Enquiry →</Button>
              </form>
              <p className="mt-4 text-center text-[11px] text-ink-muted">Powered by Techmunda · Your details are used only to respond to this enquiry. <a className="underline" href="/legal/privacy#customer-enquiries" target="_blank" rel="noopener">Privacy notice</a></p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
