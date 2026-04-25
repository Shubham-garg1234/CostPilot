import Link from "next/link";
import { Card } from "../../../components/ui";
import { OrganizationLoginPanel } from "../../../components/organization-login-panel";

export default function OrganizationLoginPage() {
  const rawClerkPublishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = Boolean(rawClerkPublishableKey && !rawClerkPublishableKey.endsWith("_xxx"));

  if (!clerkEnabled) {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-6 py-10">
        <Card className="p-8">
          <p className="text-sm text-slate-500">Organization Login</p>
          <h1 className="mt-3 font-display text-4xl font-semibold">Organization login is not configured</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Clerk keys are missing, so organization admin sign-in is not available in this environment yet.
          </p>
          <div className="mt-6">
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

  return <OrganizationLoginPanel />;
}
