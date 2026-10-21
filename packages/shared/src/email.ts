/**
 * Branded HTML e-mail renderer. The approved *plain-text* body remains the source of truth:
 * the HTML is a deterministic, escaped rendering of exactly that text (no content is added except
 * the header/footer chrome), so approving the text approves what is sent.
 * Email clients need literal hex values and web-safe fonts, hence the constants below (mirrors the app palette).
 */
const C = { royal: '#780514', gold: '#B88A36', goldDeep: '#8A641E', cream: '#F8EEDB', ivory: '#FFF9EF', maroon: '#461318', ink: '#351B1D', muted: '#705250' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface EmailRenderInput {
  subject: string;
  body: string;
  businessName: string;
}

const FOOTER_SPLIT = /\n\s*—\s*\n/;
const SIGNOFF = /^(warm regards|kind regards|regards|sincerely|best wishes|with warm regards)[,.]?$/i;

export function renderEmailHtml({ subject, body, businessName }: EmailRenderInput): string {
  const [main, ...rest] = body.replace(/\r\n/g, '\n').split(FOOTER_SPLIT);
  const footerText = rest.join('\n').trim();
  const blocks = main.trim().split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const first = blocks[0] ?? '';
  const greeting = /^(dear|hi|hello|namaste)\b/i.test(first) && first.split('\n').length === 1 ? first : null;
  const rest2 = greeting ? blocks.slice(1) : blocks;
  const signIdx = rest2.findIndex((b) => SIGNOFF.test(b.split('\n')[0].trim()));
  const content = signIdx >= 0 ? rest2.slice(0, signIdx) : rest2;
  const signature = signIdx >= 0 ? rest2[signIdx] : null;
  const preheader = escapeHtml((content[0] ?? first).replace(/\s+/g, ' ').slice(0, 110));

  const p = (t: string) => `<p style="margin:0 0 18px 0;font-family:${SANS};font-size:15.5px;line-height:1.75;color:${C.ink};">${escapeHtml(t).replace(/\n/g, '<br>')}</p>`;
  const sig = signature
    ? `<p style="margin:26px 0 0 0;font-family:${SERIF};font-size:16px;line-height:1.6;color:${C.ink};">${escapeHtml(signature.split('\n')[0])}</p><p style="margin:2px 0 0 0;font-family:${SERIF};font-size:19px;font-weight:bold;line-height:1.4;color:${C.royal};">${escapeHtml(signature.split('\n')[1] ?? '')}</p><p style="margin:2px 0 0 0;font-family:${SANS};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.goldDeep};">${escapeHtml(signature.split('\n').slice(2).join(' · '))}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.cream};">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.ivory};border:1px solid ${C.gold};border-radius:14px;overflow:hidden;">
    <tr><td align="center" style="background:${C.maroon};padding:30px 24px 24px 24px;border-bottom:3px solid ${C.gold};">
      <div style="font-family:${SERIF};font-size:20px;line-height:1;color:${C.gold};">&#9670;</div>
      <div style="margin-top:10px;font-family:${SERIF};font-size:27px;line-height:1.2;letter-spacing:1px;color:${C.cream};">${escapeHtml(businessName)}</div>
      <div style="margin-top:8px;font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${C.gold};">Fine Jewellery</div>
    </td></tr>
    <tr><td style="padding:36px 40px 12px 40px;">
      ${greeting ? `<p style="margin:0 0 20px 0;font-family:${SERIF};font-size:22px;line-height:1.35;color:${C.maroon};">${escapeHtml(greeting)}</p>` : ''}
      ${content.map(p).join('\n      ')}
      ${sig}
    </td></tr>
    <tr><td style="padding:8px 40px 0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${C.gold};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table></td></tr>
    <tr><td align="center" style="padding:20px 40px 30px 40px;">
      ${footerText ? `<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted};">${escapeHtml(footerText).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin:12px 0 0 0;font-family:${SANS};font-size:11px;color:${C.muted};">Sent by ${escapeHtml(businessName)} in reply to your enquiry.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
