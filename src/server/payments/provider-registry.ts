import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { paymentProviderAccounts } from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";
import type { PaymentProvider } from "@/server/payments/types";
import { localTestPaymentsEnabled, localTestProvider } from "./providers/local-test";
import { stripeConfigured, stripeProvider } from "./providers/stripe";

export const SUPPORTED_PAYMENT_PROVIDERS = ["stripe", "local_test"] as const;
export type SupportedPaymentProvider = (typeof SUPPORTED_PAYMENT_PROVIDERS)[number];

export function isSupportedPaymentProvider(value: string): value is SupportedPaymentProvider {
  return (SUPPORTED_PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

export function providerConfigured(provider: SupportedPaymentProvider) {
  if (provider === "stripe") return stripeConfigured();
  return localTestPaymentsEnabled();
}

export function paymentProvider(provider: string): PaymentProvider {
  if (provider === "stripe") return stripeProvider;
  if (provider === "local_test") return localTestProvider;
  throw new HttpError(400, "PAYMENT_PROVIDER_UNSUPPORTED", `Unsupported payment provider: ${provider}`);
}

export async function providerAccount(organizationId: string, provider: SupportedPaymentProvider) {
  const [row] = await photoDb.select().from(paymentProviderAccounts).where(and(
    eq(paymentProviderAccounts.organizationId, organizationId),
    eq(paymentProviderAccounts.provider, provider),
  )).limit(1);
  return row || null;
}

export async function providerSummaries(organizationId: string) {
  const rows = await photoDb.select().from(paymentProviderAccounts).where(eq(paymentProviderAccounts.organizationId, organizationId));
  return SUPPORTED_PAYMENT_PROVIDERS.map((provider) => {
    const row = rows.find((entry) => entry.provider === provider) || null;
    return {
      provider,
      configured: providerConfigured(provider),
      enabled: Boolean(row?.paymentsEnabled && row.status === "active" && providerConfigured(provider)),
      status: row?.status || "not_configured",
      externalAccountId: row?.externalAccountId || null,
      metadata: row?.metadata || null,
      testOnly: provider === "local_test",
    };
  });
}

export async function resolveCheckoutProvider(organizationId: string, preferred?: string | null) {
  const summaries = await providerSummaries(organizationId);
  if (preferred) {
    const selected = summaries.find((entry) => entry.provider === preferred);
    if (!selected || !selected.configured || !selected.enabled) {
      throw new HttpError(409, "PAYMENT_PROVIDER_UNAVAILABLE", "The requested payment provider is not enabled for this organization.");
    }
    return selected;
  }
  const stripe = summaries.find((entry) => entry.provider === "stripe" && entry.enabled);
  if (stripe) return stripe;
  const local = summaries.find((entry) => entry.provider === "local_test" && entry.enabled);
  if (local) return local;
  throw new HttpError(409, "PAYMENT_PROVIDER_UNAVAILABLE", "No payment provider is currently enabled for this gallery.");
}
