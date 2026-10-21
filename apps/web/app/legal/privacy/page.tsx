import type { Metadata } from 'next';
import { DEMO_RETENTION_DAYS, SUPPORT_EMAIL } from '@techmunda/shared';
import { LegalShell } from '@/components/legal/legal-shell';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" intro="How Techmunda handles personal data in the AI Jewellery Growth Studio demo. This describes what the software actually does today.">
      <section><h2>1. Who we are</h2><p>Techmunda (“we”) provides the AI Jewellery Growth Studio demo. For your account and sign-up data we act as the data controller. For the customer and product data you load into your workspace, you are the controller and we process it on your behalf. Contact: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p></section>
      <section><h2>2. What we collect</h2>
        <table><thead><tr><th>Data</th><th>Why</th></tr></thead><tbody>
          <tr><td>Your name, business name, e-mail, mobile number, country</td><td>To create and secure your demo workspace and contact you about it</td></tr>
          <tr><td>Password (stored only as a salted bcrypt hash)</td><td>To sign you in</td></tr>
          <tr><td>One-time verification code (stored only as a keyed hash, expires in 10 minutes) and a hashed form of your IP address</td><td>To prove you control the e-mail/mobile and to limit abuse</td></tr>
          <tr><td>Your acceptance of these policies (version, time, hashed IP, marketing choice)</td><td>To keep a record of consent</td></tr>
          <tr><td>Workspace content: products, images, PDFs, leads and contacts (including consent records), notes, tasks, e-mail drafts, campaign data</td><td>To provide the features you use</td></tr>
          <tr><td>Security and activity logs (sign-ins, approvals, sends, exports) and server request logs</td><td>Security, audit and troubleshooting. Hosting logs may contain IP addresses.</td></tr>
        </tbody></table>
        <p className="mt-3">We do not collect payment-card details, government IDs, health data or other sensitive categories. <strong>Please do not enter them.</strong></p></section>
      <section><h2>3. Verification codes (e-mail / mobile)</h2><p>When you sign up we send a one-time code to the e-mail address or mobile number you choose, using an e-mail (SMTP) or SMS delivery provider. The provider receives your address/number and the message so it can deliver it. Codes are never returned by our API, never logged in production, and expire after 10 minutes; five wrong attempts lock the request.</p></section>
      <section><h2>4. Marketing</h2><p>We only send you product or marketing messages if you tick the optional marketing box. Service messages (verification codes, security notices) are not marketing. You can withdraw consent at any time by e-mailing us.</p></section>
      <section id="customer-enquiries"><h2>5. If you filled in a jeweller’s enquiry form</h2><p>The jeweller you contacted is responsible for your enquiry data and decides how it is used. Techmunda’s software stores it for them, applies the consent you gave on the form, and never contacts you itself. Ask the jeweller to access, correct or delete your data, or to stop contacting you; you may also e-mail <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will pass the request on.</p></section>
      <section><h2>6. AI features and other service providers</h2>
        <ul>
          <li><strong>AI text features</strong> (lead qualification, e-mail drafts, reply ideas): when an AI provider (OpenAI) is configured for the deployment, the enquiry text, product interest and budget/timeline fields are sent to it for qualification and reply ideas — without the customer’s name, e-mail address or phone number. To <em>write an e-mail draft</em> we also send the customer’s first name, the appointment date (if given), your name and your business name; never the e-mail address or phone number. Otherwise a built-in rule engine runs on our own server and nothing leaves it.</li>
          <li><strong>AI image features:</strong> only if configured and only when you submit a creative job; the source photograph (with embedded metadata removed) is sent to the image provider.</li>
          <li><strong>Gmail:</strong> only if the workspace owner connects a Google account. We request permission to create drafts and send mail you have approved. Tokens are stored encrypted. Nothing is sent without a person approving it and then confirming the send.</li>
          <li><strong>Infrastructure:</strong> hosting, database and file storage providers, and the e-mail/SMS delivery provider, process data on our behalf. Data may be processed outside India or the UAE.</li>
        </ul>
        <p className="mt-2">We do not sell personal data or use it for advertising.</p></section>
      <section><h2>7. How long we keep data</h2><ul>
        <li>Self-service demo workspaces and everything in them are <strong>automatically deleted {DEMO_RETENTION_DAYS} days after creation</strong>.</li>
        <li>Unfinished sign-up requests are deleted after 7 days.</li>
        <li>You can delete a demo workspace yourself at any time in <em>Settings → Privacy &amp; data</em>.</li>
        <li>Backups kept by our hosting provider, if enabled, may hold copies for a limited period under that provider’s policy.</li></ul></section>
      <section><h2>8. Security</h2><ul>
        <li>Encrypted connections (TLS) in transit via the hosting platform.</li>
        <li>Passwords hashed with bcrypt; verification codes stored only as keyed hashes; Google tokens encrypted with AES-256-GCM.</li>
        <li>Each workspace is isolated: every request is checked against your workspace on the server; role-based access limits what each user can do.</li>
        <li>Rate limiting and bot checks on public forms; short-lived signed links for files; audit log of sensitive actions.</li></ul>
        <p className="mt-2">No online service is completely secure. This is a demonstration product: use synthetic or low-risk data unless you have agreed otherwise with us in writing.</p></section>
      <section><h2>9. Your rights</h2><p>Subject to applicable law (including India’s Digital Personal Data Protection Act, 2023, and where relevant the GDPR or UAE data-protection law) you can ask to access, correct, export or erase your data, withdraw consent, and complain to the relevant authority. You can download all workspace data (<em>Settings → Privacy &amp; data → Download my data</em>) and delete a demo workspace yourself; for anything else e-mail <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We aim to respond within 30 days.</p></section>
      <section><h2>10. Children</h2><p>The service is for businesses and adults (18+). We do not knowingly collect data from children.</p></section>
      <section><h2>11. Changes</h2><p>If we change this policy materially we will change its version number and ask you to accept it again. Previous acceptances are kept as a record.</p></section>
    </LegalShell>
  );
}
