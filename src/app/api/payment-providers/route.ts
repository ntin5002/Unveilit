import { NextRequest, NextResponse } from "next/server";
import { photoDb } from "@/db";
import { paymentProviderAccounts } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { isSupportedPaymentProvider, providerConfigured, providerSummaries } from "@/server/payments/provider-registry";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsView);
    return NextResponse.json({ success: true, data: await providerSummaries(context.activeOrganizationId) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsManage);
    const body = await request.json();
    const provider = String(body.provider || "");
    if (!isSupportedPaymentProvider(provider)) throw new HttpError(400, "PAYMENT_PROVIDER_UNSUPPORTED", "Unsupported payment provider.");
    if (!providerConfigured(provider)) throw new HttpError(409, "PAYMENT_PROVIDER_NOT_CONFIGURED", "Configure this provider on the server before enabling it.");
    const enabled = Boolean(body.enabled);
    const externalAccountId = provider === "stripe" ? (process.env.STRIPE_ACCOUNT_ID?.trim() || "platform") : "local-test";
    await photoDb.insert(paymentProviderAccounts).values({
      organizationId: context.activeOrganizationId,
      provider,
      externalAccountId,
      status: enabled ? "active" : "disabled",
      paymentsEnabled: enabled,
      metadata: provider === "local_test" ? { testOnly: true } : { accountMode: externalAccountId === "platform" ? "platform" : "connected" },
    }).onConflictDoUpdate({
      target: [paymentProviderAccounts.organizationId, paymentProviderAccounts.provider],
      set: { externalAccountId, status: enabled ? "active" : "disabled", paymentsEnabled: enabled, updatedAt: new Date() },
    });
    return NextResponse.json({ success: true, data: await providerSummaries(context.activeOrganizationId), message: enabled ? "Payment provider enabled." : "Payment provider disabled." });
  } catch (error) { return apiError(error); }
}
