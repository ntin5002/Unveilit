import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "DIRECT_UPLOAD_FLOW_REQUIRED",
      error: "Use /api/uploads/intents, upload directly to private storage, then call /api/uploads/complete.",
    },
    { status: 410 }
  );
}
