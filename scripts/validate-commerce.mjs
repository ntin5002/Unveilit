import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const checks = [
  ["Photo-owned orders schema", read("src/db/photo-schema.ts").includes('export const orders = pgTable')],
  ["Photo-owned payments schema", read("src/db/photo-schema.ts").includes('export const payments = pgTable')],
  ["gallery entitlements schema", read("src/db/photo-schema.ts").includes('export const galleryEntitlements = pgTable')],
  ["Stripe checkout adapter", read("src/server/payments/providers/stripe.ts").includes('/checkout/sessions')],
  ["Stripe raw-body webhook signature", read("src/server/payments/providers/stripe.ts").includes('Stripe webhook signature verification failed')],
  ["webhook persisted before apply", read("src/app/api/payments/webhooks/stripe/route.ts").indexOf('insert(paymentWebhookEvents)') < read("src/app/api/payments/webhooks/stripe/route.ts").indexOf('await applyVerifiedEvent')],
  ["failed webhook retry", read("src/app/api/payments/webhooks/stripe/route.ts").includes('existing.status === "failed"')],
  ["refund idempotency key", read("src/app/api/payments/[id]/refund/route.ts").includes('idempotencyKey')],
  ["paid amount/currency validation", read("src/server/payments/payment-service.ts").includes('PAYMENT_AMOUNT_MISMATCH')],
  ["out-of-order payment protection", read("src/server/payments/payment-service.ts").includes('late processing/failed/paid event')],
  ["refund/dispute entitlement revoke", read("src/server/payments/payment-service.ts").includes('PAYMENT_DISPUTED') && read("src/server/payments/payment-service.ts").includes('PAYMENT_REFUNDED')],
  ["refund revokes only source order entitlement", read("src/server/payments/payment-service.ts").includes('existingEntitlement?.sourceOrderId === order.id')],
  ["priced Delivery link requires entitlement", read("src/app/api/deliveries/[id]/share/route.ts").includes('DELIVERY_PAYMENT_REQUIRED')],
  ["accountless public checkout", fs.existsSync("src/app/api/public/galleries/[token]/checkout/route.ts")],
  ["entitlement-gated ORIGINAL", read("src/app/api/public/galleries/[token]/photos/[photoId]/original/route.ts").includes('ORIGINALS_LOCKED')],
  ["Platform product entitlement gates public gallery", read("src/server/services/public-gallery-service.ts").includes('organizationPhotoProductEnabled')],
  ["Platform Core schema untouched by commerce migration", !read("drizzle/0.5.7-orders-payments-entitlements.sql").includes('product_entitlements')],
  ["Signative ORDER external link", read("src/app/api/integrations/signative/links/route.ts").includes('case "ORDER"')],
  ["local test provider labeled test only", read("src/server/payments/providers/local-test.ts").includes('testOnly: true')],
  ["server-only Stripe secret", !read("src/server/payments/providers/stripe.ts").includes('NEXT_PUBLIC_STRIPE')],
  ["gallery pricing controls", read("src/app/dashboard/galleries/page.tsx").includes('Original download price')],
  ["staff commerce dashboard", fs.existsSync("src/app/dashboard/orders/page.tsx")],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} commerce checks passed.`);
if (failed) process.exit(1);
