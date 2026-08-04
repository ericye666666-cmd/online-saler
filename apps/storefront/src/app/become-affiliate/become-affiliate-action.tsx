"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearAffiliateSessionCache } from "../../affiliate/affiliate-client";
import { Button } from "../../components/ui/button";

export function BecomeAffiliateAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/affiliate/enroll", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Affiliate profile could not be created.");
      clearAffiliateSessionCache();
      router.push("/seller");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Affiliate profile could not be created.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button size="lg" type="button" onClick={() => void enroll()} disabled={busy} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
        Create my Level 1 Affiliate profile
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
