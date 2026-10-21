export const ROLES = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER', 'SALES_EXECUTIVE', 'VIEWER'] as const;
export type RoleName = (typeof ROLES)[number];

/** Who may approve outbound (external) communications. */
export const COMMUNICATION_APPROVER_ROLES: RoleName[] = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER'];
/** Who may confirm the final Send of an already-approved message. */
export const COMMUNICATION_SENDER_ROLES: RoleName[] = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE'];
/** Who may approve/reject AI-generated creative assets. */
export const CREATIVE_APPROVER_ROLES: RoleName[] = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER'];

export const LEAD_STAGES = ['NEW', 'QUALIFIED', 'CONTACTED', 'APPOINTMENT', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
export type LeadStageName = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_LABELS: Record<LeadStageName, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  CONTACTED: 'Contacted',
  APPOINTMENT: 'Demo / Appointment',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const CREATIVE_STYLES = [
  { id: 'luxury_editorial', label: 'Luxury editorial', direction: 'refined magazine-style jewellery editorial, soft diffused light, ivory and champagne tones' },
  { id: 'bridal_collection', label: 'Bridal collection', direction: 'Indian bridal collection, deep red silk and antique gold backdrop, regal warmth' },
  { id: 'diwali_festive', label: 'Diwali festive', direction: 'Diwali festive setting, warm diyas bokeh, rich marigold and gold glow' },
  { id: 'minimal_ecommerce', label: 'Minimal e-commerce', direction: 'clean minimal e-commerce shot on an ivory seamless background, even soft shadows' },
  { id: 'premium_black_gold', label: 'Premium black and gold', direction: 'dramatic black velvet surface with restrained gold highlights' },
  { id: 'lifestyle_campaign', label: 'Lifestyle campaign', direction: 'natural lifestyle campaign, warm daylight, elegant everyday context' },
  { id: 'dubai_boutique', label: 'Dubai luxury boutique', direction: 'Dubai luxury boutique display, polished marble, warm spotlighting' },
] as const;
export type CreativeStyleId = (typeof CREATIVE_STYLES)[number]['id'];

export const ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const LEAD_SCORE_WEIGHTS = {
  purchaseIntent: 30,
  budget: 20,
  timeframe: 20,
  specificProduct: 15,
  appointment: 15,
} as const;

export const CONSENT_TEXT =
  'I agree to be contacted by this jewellery business about my enquiry by email, phone or WhatsApp. I can withdraw consent at any time.';

/** Bump when the Terms or Privacy Policy text changes materially; acceptances are stored per version. */
export const POLICY_VERSION = '2026-10-21';
export const DEMO_RETENTION_DAYS = 30;
export const SUPPORT_EMAIL = 'techmunda21@gmail.com';
