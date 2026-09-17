"use client";

import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";

type SessionResponse = {
  authenticated?: boolean;
  // The endpoint has carried the signed-in customer both nested and flat;
  // read either so a change on one side does not blank this row.
  customer?: { email?: string | null; displayName?: string | null } | null;
  email?: string | null;
  displayName?: string | null;
};

function readIdentity(payload: SessionResponse | null): { label: string } | null {
  if (!payload?.authenticated) return null;
  const email = payload.customer?.email ?? payload.email ?? null;
  const displayName = payload.customer?.displayName ?? payload.displayName ?? null;
  const label = displayName?.trim() || email?.trim();
  return label ? { label } : null;
}

export function AccountSessionRow() {
  const { t } = useStorefrontI18n();
  const [identity, setIdentity] = useState<{ label: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<SessionResponse>) : null))
      .then((payload) => {
        if (!active) return;
        setIdentity(readIdentity(payload));
        setChecked(true);
      })
      .catch(() => {
        // A failed check must not strand the shopper without a way in or out.
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setIdentity(null);
    } finally {
      setSigningOut(false);
    }
  }

  if (!checked) return null;

  if (!identity) {
    return (
      <ul className="accountList">
        <li>
          <Link href="/login">
            <LogIn size={19} aria-hidden="true" />
            <span className="accountRowText"><strong>{t("account.signIn")}</strong></span>
          </Link>
        </li>
      </ul>
    );
  }

  return (
    <ul className="accountList">
      <li className="accountSessionRow">
        <span className="accountRowText">
          <strong>{identity.label}</strong>
          <span>{t("account.signedIn")}</span>
        </span>
        <button className="accountSignOut" type="button" onClick={signOut} disabled={signingOut}>
          <LogOut size={17} aria-hidden="true" />
          {signingOut ? t("auth.signingOut") : t("auth.signOut")}
        </button>
      </li>
    </ul>
  );
}
