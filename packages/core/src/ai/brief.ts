import { CREATIVE_STYLES, type AspectRatio, type CreativeStyleId } from '@techmunda/shared';

export interface BriefProduct {
  name: string;
  category: string;
  metalType?: string | null;
  purity?: string | null;
  stoneType?: string | null;
}

export interface CreativeBrief {
  style: CreativeStyleId;
  styleLabel: string;
  aspectRatio: AspectRatio;
  prompt: string;
  mustPreserve: string[];
  mustNotDo: string[];
  accuracyChecklist: string[];
}

/**
 * Builds a brief ONLY from catalogue facts the tenant entered. Specs are never invented:
 * unknown attributes are simply omitted from the prompt.
 */
export function buildCreativeBrief(product: BriefProduct, styleId: string, aspectRatio: AspectRatio, notes?: string): CreativeBrief {
  const style = CREATIVE_STYLES.find((s) => s.id === styleId);
  if (!style) throw new Error(`Unknown style: ${styleId}`);
  const facts = [product.metalType, product.stoneType && `${product.stoneType} stones`, product.category].filter(Boolean).join(', ');
  const mustPreserve = [
    'exact jewellery design, silhouette and proportions from the source photo',
    'number, shape, colour and placement of every gemstone and pearl',
    'metal colour and finish',
    'any engraving, hallmark or maker mark exactly as in the source',
  ];
  const mustNotDo = [
    'do not add, remove or restyle jewellery elements',
    'do not add text, logos, watermarks, prices or purity/weight claims',
    'do not show identifiable real people',
  ];
  const prompt = [
    `Professional marketing photograph of the jewellery piece in the source image (${product.name}${facts ? `; ${facts}` : ''}).`,
    `Creative direction: ${style.direction}.`,
    `Keep the jewellery itself pixel-faithful to the source; change only the surroundings, lighting and composition.`,
    `Composition for ${aspectRatio} frame with the jewellery as the clear hero.`,
    ...mustNotDo.map((m) => `Constraint: ${m}.`),
    notes ? `Additional art direction from the team (style only, never specs): ${notes}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    style: style.id,
    styleLabel: style.label,
    aspectRatio,
    prompt,
    mustPreserve,
    mustNotDo,
    accuracyChecklist: ['Hallmark / engraving unchanged', 'Gemstone count and colours match the original', 'Metal colour and finish match', 'No weight, purity or price claims added'],
  };
}
