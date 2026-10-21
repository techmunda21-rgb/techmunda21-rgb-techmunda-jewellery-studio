'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Gem, ImageIcon, Mail, Users, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Banner } from '@/components/ui/misc';
import { GoldDivider, Logo, LogoMark, Motif } from '@/components/brand/brand';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';

const schema = z.object({ email: z.string().min(1, 'Enter your email').email('Enter a valid email'), password: z.string().min(1, 'Enter your password'), remember: z.boolean().optional() });
type Form = z.infer<typeof schema>;

const FEATURES = [
  { icon: ImageIcon, label: 'Premium Product Visuals' },
  { icon: Users, label: 'AI Lead Capture' },
  { icon: Gem, label: 'Smart CRM' },
  { icon: Workflow, label: 'Automated Follow-ups' },
];

export default function LoginPage() {
  const router = useRouter();
  const { me, signIn } = useAuth();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => { if (me) router.replace('/overview'); }, [me, router]);

  return (
    <main id="main" className="grid min-h-screen bg-maroon lg:grid-cols-[1.1fr_1fr]">
      {/* hero: full-bleed model photograph, text sits on a solid gradient so nothing is covered or misaligned */}
      <section className="relative hidden min-h-screen overflow-hidden bg-maroon-deep text-maroon-foreground lg:block">
        {/* photo occupies the upper ~62% so the necklace stays visible; text sits on solid maroon below it */}
        <div className="absolute inset-x-0 top-0 h-[54%]">
          <img src="/images/model-bridal.jpg" alt="Model wearing a gold bridal choker with ruby and emerald stones" className="h-full w-full object-cover object-[50%_70%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-deep via-maroon-deep/40 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-maroon-deep/80 to-transparent" aria-hidden />
        </div>
        <Motif className="pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] opacity-20" />
        <div className="relative z-10 flex min-h-screen flex-col justify-between px-12 py-10 xl:px-14">
          <Logo />
          <div className="max-w-lg">
            <p className="eyebrow !text-gold">AI Jewellery Growth Studio</p>
            <h1 className="mt-3 font-editorial text-5xl font-semibold leading-[1.05] text-ivory xl:text-[56px]">Transform Your Jewellery Business with AI</h1>
            <GoldDivider className="my-6 max-w-xs" />
            <ul className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map(({ icon: I, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/70 bg-maroon-deep/60 text-gold"><I className="h-4 w-4" aria-hidden /></span>
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-xs text-maroon-foreground/70">Premium · Intelligent · Trusted — India · Dubai · Global</p>
          </div>
        </div>
      </section>

      {/* form */}
      <section className="motif-bg relative flex items-center justify-center bg-cream px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden"><Logo tone="dark" /></div>
          <div className="panel p-7 sm:p-9">
            <div className="mb-6 text-center">
              <LogoMark variant="plain" className="mx-auto mb-1 h-24 w-24" />
              <h1 className="font-display text-2xl font-semibold">Welcome Back</h1>
              <p className="mt-1 text-sm text-ink-muted">Sign in to your Techmunda account</p>
            </div>
            {error && <Banner tone="error" className="mb-4">{error}</Banner>}
            <form
              noValidate
              className="space-y-4"
              onSubmit={handleSubmit(async (v) => {
                setError(null);
                try { await signIn(v.email.trim().toLowerCase(), v.password); router.replace('/overview'); }
                catch (e) { setError(errorMessage(e)); }
              })}
            >
              <Field label="Email" htmlFor="email" error={errors.email?.message} required>
                <Input id="email" type="email" autoComplete="username" placeholder="you@company.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} />
              </Field>
              <Field label="Password" htmlFor="password" error={errors.password?.message} required>
                <div className="relative">
                  <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="pr-10" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gold-deep hover:bg-gold/15">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <div className="flex items-center justify-between text-[13px]">
                <label className="flex cursor-pointer items-center gap-2"><Checkbox {...register('remember')} className="!mt-0" /> Keep me signed in</label>
                <a className="font-medium text-royal underline-offset-2 hover:underline" href="mailto:techmunda21@gmail.com?subject=Password%20reset">Forgot password?</a>
              </div>
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Sign In →</Button>
            </form>
            <GoldDivider className="my-5" />
            <p className="text-center text-[13px] text-ink-muted">
              New to Techmunda?{' '}
              <Link className="font-semibold text-royal hover:underline" href="/signup">Create a demo workspace</Link>
              <span className="mx-1.5 text-gold">·</span>
              <a className="inline-flex items-center gap-1 font-semibold text-royal hover:underline" href="mailto:techmunda21@gmail.com?subject=Request%20a%20Demo"><Mail className="h-3.5 w-3.5" aria-hidden />Request a Demo</a>
            </p>
          </div>
          <p className="mt-4 text-center text-[11px] text-ink-muted">Demo workspace · seeded with synthetic data · <Link className="underline" href="/legal/terms">Terms</Link> · <Link className="underline" href="/legal/privacy">Privacy</Link></p>
        </div>
      </section>
    </main>
  );
}
