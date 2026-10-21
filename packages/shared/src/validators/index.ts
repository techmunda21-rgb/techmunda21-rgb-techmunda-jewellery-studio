import { z } from 'zod';
import { POLICY_VERSION } from '../constants';
import { purityError } from '../jewellery';
import { ALLOWED_IMAGE_MIME, ASPECT_RATIOS, CREATIVE_STYLES, LEAD_STAGES, MAX_UPLOAD_BYTES } from '../constants';

const money = z.coerce.number().nonnegative().finite();

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  tenantSlug: z.string().trim().max(60).optional(),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(500) });

const productBase = z.object({
  sku: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(4000).nullish(),
  metalType: z.string().trim().max(60).nullish(),
  purity: z.string().trim().max(40).nullish(),
  stoneType: z.string().trim().max(80).nullish(),
  weight: money.refine((n) => n > 0, 'Weight must be greater than 0').nullish(),
  price: money.nullish(),
  currency: z.string().length(3).default('INR'),
  availability: z.enum(['IN_STOCK', 'MADE_TO_ORDER', 'OUT_OF_STOCK']).default('IN_STOCK'),
});
export const productFieldsSchema = productBase;
export const productInputSchema = productBase.superRefine((v, ctx) => {
  const e = purityError(v.metalType, v.purity);
  if (e) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purity'], message: e });
});
export const productUpdateSchema = productBase.partial().superRefine((v, ctx) => {
  if (v.metalType !== undefined || v.purity !== undefined) {
    const e = purityError(v.metalType, v.purity);
    if (e) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purity'], message: e });
  }
});

export const uploadUrlSchema = z.object({
  productId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_IMAGE_MIME),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'File exceeds the 10 MB limit'),
  /** PHOTO = catalogue image; SPIN_FRAME = one frame of a 360° turntable set, ordered by sortOrder. */
  kind: z.enum(['PHOTO', 'SPIN_FRAME']).default('PHOTO'),
  sortOrder: z.number().int().min(0).max(359).default(0),
  rightsConfirmed: z.literal(true, { errorMap: () => ({ message: 'You must confirm the image is client-authorised' }) }),
});
export const confirmUploadSchema = z.object({ uploadToken: z.string().min(10).max(2000) });

export const creativeJobSchema = z.object({
  productId: z.string().uuid(),
  sourceMediaId: z.string().uuid(),
  style: z.enum(CREATIVE_STYLES.map((s) => s.id) as [string, ...string[]]),
  aspectRatio: z.enum(ASPECT_RATIOS).default('1:1'),
  variations: z.number().int().min(1).max(4).default(2),
  promptNotes: z.string().trim().max(1000).optional(),
});

export const assetReviewSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});
export const assetApproveSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  accuracyChecklistConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'Confirm the accuracy checklist (hallmark, stones, metal, weight) before approving' }),
  }),
});

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  campaignType: z.enum(['FESTIVE', 'BRIDAL', 'LUXURY', 'ECOMMERCE', 'OTHER']),
  description: z.string().trim().max(2000).nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  budget: money.nullish(),
  currency: z.string().length(3).default('INR'),
});
export const campaignUpdateSchema = campaignInputSchema.partial().extend({
  status: z.enum(['DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  attachAssetIds: z.array(z.string().uuid()).max(50).optional(),
});

/** Public enquiry form. `website` is a honeypot (must stay empty). */
export const publicLeadSchema = z
  .object({
    tenantSlug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(2).max(120),
    email: z.string().email().max(254).optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().min(7).max(20).regex(/^[+0-9 ()-]+$/, 'Enter a valid phone number').optional().or(z.literal('').transform(() => undefined)),
    productInterest: z.string().trim().max(120).optional(),
    budgetRange: z.string().trim().max(60).optional(),
    preferredMaterial: z.string().trim().max(120).optional(),
    purchaseTimeline: z.string().trim().max(60).optional(),
    appointmentDate: z.coerce.date().optional().or(z.literal('').transform(() => undefined)),
    message: z.string().trim().max(2000).optional(),
    consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required so we can contact you' }) }),
    website: z.string().max(500).optional(),
    formStartedAt: z.number().optional(),
    turnstileToken: z.string().max(4000).optional(),
  })
  .refine((v) => !!v.email || !!v.phone, { message: 'Provide an email address or phone number', path: ['email'] });

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STAGES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
  productInterest: z.string().trim().max(120).nullable().optional(),
  budgetMin: money.nullable().optional(),
  budgetMax: money.nullable().optional(),
});
export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const taskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  dueAt: z.coerce.date().optional(),
  assignedTo: z.string().uuid().optional(),
});
export const taskUpdateSchema = z.object({ completed: z.boolean().optional(), dueAt: z.coerce.date().nullable().optional() });

export const opportunityInputSchema = z.object({
  leadId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  estimatedValue: money.nullish(),
  currency: z.string().length(3).default('INR'),
  expectedCloseDate: z.coerce.date().nullish(),
});
export const opportunityUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  estimatedValue: money.nullable().optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
});

export const csvImportPreviewSchema = z.object({ csv: z.string().min(1).max(2_000_000) });
export const csvImportCommitSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().email().optional(),
        phone: z.string().trim().max(20).optional(),
        productInterest: z.string().trim().max(120).optional(),
        city: z.string().trim().max(80).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export const draftCreateSchema = z.object({
  leadId: z.string().uuid(),
  /** When true the AI writes the draft. When false subject/body are required. */
  generate: z.boolean().default(true),
  subject: z.string().trim().min(2).max(200).optional(),
  body: z.string().trim().min(2).max(10000).optional(),
});
export const draftUpdateSchema = z.object({
  subject: z.string().trim().min(2).max(200).optional(),
  body: z.string().trim().min(2).max(10000).optional(),
});
export const draftReviewSchema = z.object({ notes: z.string().trim().max(1000).optional() });
export const draftSendSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  /** Must equal the draft's approved version — guards against a stale client view. */
  version: z.number().int().positive(),
});

export const suggestReplySchema = z.object({ tone: z.enum(['warm', 'concise', 'formal']).default('warm') });

/** Structured output the LLM must return for lead qualification. */
export const qualificationOutputSchema = z.object({
  intent: z.enum(['purchase', 'research', 'appointment', 'support', 'unknown']),
  product_category: z.string().max(120).nullable(),
  budget_min: z.number().nonnegative().nullable(),
  budget_max: z.number().nonnegative().nullable(),
  purchase_timeline: z.string().max(120).nullable(),
  qualification_score: z.number().int().min(0).max(100),
  qualification_reason: z.string().max(600),
  suggested_next_action: z.string().max(400),
  requires_human_review: z.boolean(),
});
export type QualificationOutput = z.infer<typeof qualificationOutputSchema>;

export const productImportCommitSchema = z.object({ rows: z.array(productBase.extend({ currency: z.string().length(3).default('INR') })).min(1).max(500), updateExisting: z.boolean().default(false) });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

/* ───────── self-service signup (demo workspace) ───────── */
const strongPassword = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const signupStartSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(120),
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  /** International format, e.g. +919876543210 */
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Enter the mobile number in international format, e.g. +919876543210'),
  country: z.enum(['IN', 'AE', 'OTHER']).default('IN'),
  password: strongPassword,
  /** which channel receives the one-time code */
  channel: z.enum(['EMAIL', 'SMS']),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Demo Use' }) }),
  acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'You must accept the Privacy Policy' }) }),
  marketingOptIn: z.boolean().default(false),
  policyVersion: z.literal(POLICY_VERSION, { errorMap: () => ({ message: 'The policies were updated. Reload the page and review them again.' }) }),
  website: z.string().max(500).optional(), // honeypot
});
export const signupVerifySchema = z.object({ requestId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const signupResendSchema = z.object({ requestId: z.string().uuid() });
export const accountDeleteSchema = z.object({ password: z.string().min(1).max(200), confirm: z.literal('DELETE MY WORKSPACE') });
