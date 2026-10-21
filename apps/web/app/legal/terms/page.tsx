import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_RETENTION_DAYS, SUPPORT_EMAIL } from '@techmunda/shared';
import { LegalShell } from '@/components/legal/legal-shell';

export const metadata: Metadata = { title: 'Terms of Demo Use' };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Demo Use" intro="Please read these terms before creating a demo workspace. They are written in plain language.">
      <section><h2>1. What this is</h2><p>The Techmunda AI Jewellery Growth Studio is a <strong>demonstration</strong> for evaluating the product with your own business in mind. It is not a production service and comes with no uptime, support or data-durability guarantee.</p></section>
      <section><h2>2. Who may use it</h2><p>You must be at least 18 and acting for a business, or be authorised by one. You must give accurate sign-up details and keep your password secret. You are responsible for everything done through your account, including users you add.</p></section>
      <section><h2>3. Your data</h2><ul>
        <li>You keep ownership of what you upload. You give us permission to store and process it only to run the demo for you, as described in the <Link href="/legal/privacy">Privacy Policy</Link>.</li>
        <li>You confirm you have the right to use every image, PDF and contact you load, and that you have the consent needed to hold and contact those people.</li>
        <li>Do not enter payment-card numbers, government ID numbers, health data or other sensitive data.</li>
        <li>Demo workspaces and their data are deleted automatically {DEMO_RETENTION_DAYS} days after creation. Download anything you want to keep before then.</li></ul></section>
      <section><h2>4. Acceptable use</h2><ul>
        <li>No unlawful, misleading, harassing or infringing content; no malware or attempts to break, probe or overload the service or other workspaces.</li>
        <li>Send messages only to people who have given you permission, and honour opt-outs. The software requires recorded consent before drafting an email and a person’s approval before anything is sent, but compliance with anti-spam and privacy laws remains your responsibility.</li>
        <li>No reselling, scraping or automated sign-ups.</li></ul></section>
      <section><h2>5. AI features and accuracy</h2><p>Where AI is used, outputs can be wrong. Generated images may not reproduce a real piece exactly (hallmarks, stone counts, finish). Lead scores are a prioritisation aid, not a prediction. <strong>You must review and approve AI output before using it</strong>, and you are responsible for the accuracy of purity, weight and price you publish. Features labelled “demo simulation” do not use real AI.</p></section>
      <section><h2>6. Third-party connections</h2><p>If you connect Google (Gmail), you authorise us to create drafts and to send only the messages you have approved and confirmed. You can disconnect at any time in Settings or from your Google account permissions. Third-party services are subject to their own terms.</p></section>
      <section><h2>7. Availability and changes</h2><p>We may change, pause or remove features, reset demo data, or suspend accounts that break these terms or put the service at risk. We will try, but are not obliged, to warn you first.</p></section>
      <section><h2>8. Liability</h2><p>The demo is provided “as is”. To the extent the law allows, Techmunda is not liable for indirect or consequential loss, lost profits or lost data arising from your use of the demo. Nothing here limits liability that cannot be limited by law.</p></section>
      <section><h2>9. Ending</h2><p>You can stop using the demo and delete your workspace at any time (<em>Settings → Privacy &amp; data</em>). We may end your access if you breach these terms.</p></section>
      <section><h2>10. Contact</h2><p><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p></section>
    </LegalShell>
  );
}
