import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { deleteContact, getContact, updateContact } from "@/server/services/contact-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    return NextResponse.json({ success: true, data: await getContact(context, id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const data = await updateContact(context, id, await request.json());
    await writeAuditEvent(request, context, { action: "contact.updated", resourceType: "contact", resourceId: id });
    return NextResponse.json({ success: true, data, message: "Client updated successfully" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    await deleteContact(context, id);
    await writeAuditEvent(request, context, { action: "contact.deleted", resourceType: "contact", resourceId: id });
    return NextResponse.json({ success: true, message: "Client deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
