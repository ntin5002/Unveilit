function cleanPublicValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

/**
 * Central product-brand configuration.
 *
 * Rename the product without touching feature code by setting NEXT_PUBLIC_APP_NAME.
 * These values are intentionally public-safe and may be imported by server and client code.
 */
export const APP_NAME = cleanPublicValue(process.env.NEXT_PUBLIC_APP_NAME, "Photo Delivery");
export const APP_TAGLINE = cleanPublicValue(process.env.NEXT_PUBLIC_APP_TAGLINE, "Professional Delivery");
export const APP_DESCRIPTION = cleanPublicValue(
  process.env.NEXT_PUBLIC_APP_DESCRIPTION,
  "Protected photography proofing, payment, and delivery platform.",
);
