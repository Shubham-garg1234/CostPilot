"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getEmployeeAccessToken } from "../lib/api";
import { signOutEmployee, signOutOrganization } from "../lib/auth-session";

function AuthControlsWithClerk() {
  const pathname = usePathname();
  const clerk = useClerk();
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

  function handleEmployeeSignOut() {
    void signOutEmployee({
      signOutClerk: () => clerk.signOut(),
      redirectTo: "/employee/login"
    });
  }

  function handleOrganizationSignOut() {
    void signOutOrganization({
      signOutClerk: () => clerk.signOut(),
      redirectTo: "/organization/login"
    });
  }

  return (
    <div className="flex items-center gap-3">
      {hasEmployeeToken ? (
        <button
          onClick={handleEmployeeSignOut}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          {workspace === "organization" ? "Clear Employee Session" : "Employee Logout"}
        </button>
      ) : workspace !== "organization" ? (
        <Link href="/employee/login" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Employee Login
        </Link>
      ) : null}
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
            {workspace === "organization" ? (
              <button
                onClick={handleOrganizationSignOut}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                Organization Logout
              </button>
            ) : null}
            <UserButton afterSignOutUrl="/organization/login" />
          </SignedIn>
        </>
      ) : null}
    </div>
  );
}

function AuthControlsWithoutClerk() {
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

  return (
    <div className="flex items-center gap-3">
      {hasEmployeeToken ? (
        <button
          onClick={() => void signOutEmployee({ redirectTo: "/employee/login" })}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          {workspace === "organization" ? "Clear Employee Session" : "Employee Logout"}
        </button>
      ) : workspace !== "organization" ? (
        <Link href="/employee/login" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Employee Login
        </Link>
      ) : null}
      {workspace !== "employee" ? (
        <Link href="/organization/login" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Organization Login
        </Link>
      ) : null}
    </div>
  );
}

export function AuthControls({ enabled }: { enabled: boolean }) {
  return enabled ? <AuthControlsWithClerk /> : <AuthControlsWithoutClerk />;
}
