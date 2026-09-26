import { healthVersion, versionAtLeast } from "./validation-version.mjs";
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const checks=[
 ['photo commerce migration', 'drizzle/0.5.7-orders-payments-entitlements.sql', /source_order_id|public_token_hash/],
 ['orders dashboard', 'src/app/dashboard/orders/page.tsx', /Orders|Entitlements|Providers/],
 ['public checkout', 'src/app/api/public/galleries/[token]/checkout/route.ts', /startCheckout/],
 ['stripe checkout provider', 'src/server/payments/providers/stripe.ts', /checkout\/sessions/],
 ['stripe signature verification', 'src/server/payments/providers/stripe.ts', /timingSafeEqual/],
 ['webhook idempotency', 'src/app/api/payments/webhooks/stripe/route.ts', /onConflictDoNothing/],
 ['amount currency verification', 'src/server/payments/payment-service.ts', /PAYMENT_AMOUNT_MISMATCH/],
 ['payment entitlement grant', 'src/server/payments/payment-service.ts', /grantGalleryEntitlement/],
 ['full refund revoke', 'src/server/payments/payment-service.ts', /PAYMENT_REFUNDED/],
 ['pending refund does not revoke', 'src/app/api/payments/[id]/refund/route.ts', /Access remains unchanged until the provider confirms/],
 ['private original entitlement route', 'src/app/api/public/galleries/[token]/photos/[photoId]/original/route.ts', /entitlementIsActive/],
 ['platform subscription boundary', 'docs/SIGNATIVE-INTEGRATION.md', /Platform Core continues to own SaaS subscription\/product entitlement/],
 ['local test provider', 'src/server/payments/providers/local-test.ts', /Local test payments/],
 ['orders navigation', 'src/components/DashboardLayout.tsx', /\/dashboard\/orders/],
 ['0.5.7 runtime version', 'src/app/api/health/route.ts', /.*/],
];
let passed=0;
for (const [name,file,re] of checks){ const ok=name === '0.5.7 runtime version' ? (fs.existsSync(file) && versionAtLeast(healthVersion(read(file)), '0.5.7')) : (fs.existsSync(file)&&re.test(read(file))); console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok) passed++; }
console.log(`\n${passed}/${checks.length} commerce checks passed.`);
process.exitCode=passed===checks.length?0:1;
