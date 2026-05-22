"use client";

import { clearEmployeeAccessToken } from "./api";

type ClerkSignOut = () => Promise<void> | void;

type SignOutEmployeeOptions = {
  redirectTo?: string;
  signOutClerk?: ClerkSignOut;
};

type SignOutOrganizationOptions = {
  redirectTo?: string;
  signOutClerk?: ClerkSignOut;
};

export async function signOutEmployee(options?: SignOutEmployeeOptions) {
  clearEmployeeAccessToken();

  if (options?.signOutClerk) {
    await options.signOutClerk();
  }

  if (options?.redirectTo) {
    window.location.href = options.redirectTo;
  }
}

export async function signOutOrganization(options?: SignOutOrganizationOptions) {
  clearEmployeeAccessToken();

  if (options?.signOutClerk) {
    await options.signOutClerk();
  }

  if (options?.redirectTo) {
    window.location.href = options.redirectTo;
  }
}
