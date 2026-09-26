import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { createContact, listContacts } from "@/server/services/contact-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const data = await listContacts(context);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    const contact = await createContact(context, body);
    await writeAuditEvent(request, context, {
      action: "contact.created",
      resourceType: "contact",
      resourceId: contact.id,
    });
    return NextResponse.json({ success: true, data: contact, message: "Client created successfully" }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
