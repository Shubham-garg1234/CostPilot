"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Card } from "./ui";

export function OrganizationLoginPanel() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/organization");
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 py-10">
      <Card className="p-8">
        <p className="text-sm text-slate-500">Organization Login</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Sign in as an organization admin</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Organization admins use this route to enter the management workspace. After login, the first step is setting your
          organization name and slug.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <SignInButton mode="modal">
            <button className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white">Continue as organization</button>
          </SignInButton>
          <Link
            href="/employee/login"
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-slate-700"
          >
            Go to employee login
          </Link>
        </div>
      </Card>
    </main>
  );
}
