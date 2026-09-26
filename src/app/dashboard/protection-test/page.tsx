import { notFound } from "next/navigation";
import ProtectionTestClient from "@/features/capture-protection/ProtectionTestClient";

export const dynamic = "force-dynamic";

export default function ProtectionTestPage() {
  const enabled = process.env.NODE_ENV !== "production" || process.env.PHOTO_ENABLE_PROTECTION_TEST_PANEL === "true";
  if (!enabled) notFound();
  return <ProtectionTestClient />;
}
