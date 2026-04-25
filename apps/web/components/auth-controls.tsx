"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { clearEmployeeAccessToken, getEmployeeAccessToken } from "../lib/api";

export function AuthControls({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [hasEmployeeToken, setHasEmployeeToken] = useState(false);

  useEffect(() => {
    const sync = () => setHasEmployeeToken(Boolean(getEmployeeAccessToken()));

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const workspace = pathname.startsWith("/employee")
    ? "employee"
    : pathname.startsWith("/organization") || pathname.startsWith("/policies") || pathname.startsWith("/alerts") || pathname.startsWith("/billing")
      ? "organization"
      : "public";

  function signOutEmployee() {
    clearEmployeeAccessToken();
    setHasEmployeeToken(false);
    window.location.href = "/employee/login";
  }

  return (
    <div className="flex items-center gap-3">
      {workspace !== "organization" && !hasEmployeeToken ? (
        <Link href="/employee/login" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Employee Login
        </Link>
      ) : null}
      {workspace !== "organization" && hasEmployeeToken ? (
        <button
          onClick={signOutEmployee}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Employee Logout
        </button>
      ) : null}
      {enabled ? (
        <>
          {workspace !== "employee" ? (
            <>
              <SignedOut>
                <Link
                  href="/organization/login"
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Organization Login
                </Link>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/organization/login" />
              </SignedIn>
            </>
          ) : null}
        </>
      ) : workspace !== "employee" ? (
        <Link href="/organization/login" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Organization Login
        </Link>
      ) : null}
    </div>
  );
}
