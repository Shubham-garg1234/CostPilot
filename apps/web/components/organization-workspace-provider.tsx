"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { ApiError, requestJson } from "../lib/api";
import type {
  BillingResponse,
  DashboardSummary,
  OrganizationSnapshot,
  PolicyRecord,
  WorkspaceSlice
} from "../lib/organization-workspace-types";

type OrganizationWorkspaceContextValue = {
  authReady: boolean;
  isSignedIn: boolean;
  dashboard: WorkspaceSlice<DashboardSummary>;
  organization: WorkspaceSlice<OrganizationSnapshot>;
  policies: WorkspaceSlice<PolicyRecord[]>;
  billing: WorkspaceSlice<BillingResponse>;
  ensureDashboard: (options?: { force?: boolean }) => Promise<DashboardSummary | null>;
  ensureOrganization: (options?: { force?: boolean }) => Promise<OrganizationSnapshot | null>;
  ensurePolicies: (options?: { force?: boolean }) => Promise<PolicyRecord[] | null>;
  ensureBilling: (options?: { force?: boolean }) => Promise<BillingResponse | null>;
  invalidateDashboard: () => void;
  invalidateOrganization: () => void;
  invalidatePolicies: () => void;
  invalidateBilling: () => void;
};

const OrganizationWorkspaceContext = createContext<OrganizationWorkspaceContextValue | null>(null);

const emptySlice = <T,>(): WorkspaceSlice<T> => ({
  data: null,
  status: "idle",
  error: ""
});

function resolveError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function OrganizationWorkspaceProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [dashboard, setDashboard] = useState<WorkspaceSlice<DashboardSummary>>(emptySlice);
  const [organization, setOrganization] = useState<WorkspaceSlice<OrganizationSnapshot>>(emptySlice);
  const [policies, setPolicies] = useState<WorkspaceSlice<PolicyRecord[]>>(emptySlice);
  const [billing, setBilling] = useState<WorkspaceSlice<BillingResponse>>(emptySlice);

  const inflightRef = useRef({
    dashboard: null as Promise<DashboardSummary | null> | null,
    organization: null as Promise<OrganizationSnapshot | null> | null,
    policies: null as Promise<PolicyRecord[] | null> | null,
    billing: null as Promise<BillingResponse | null> | null
  });

  const resetWorkspace = useCallback(() => {
    inflightRef.current = {
      dashboard: null,
      organization: null,
      policies: null,
      billing: null
    };
    setDashboard(emptySlice());
    setOrganization(emptySlice());
    setPolicies(emptySlice());
    setBilling(emptySlice());
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      resetWorkspace();
    }
  }, [isLoaded, isSignedIn, userId, resetWorkspace]);

  const ensureDashboard = useCallback(
    async (options?: { force?: boolean }) => {
      if (!isLoaded) {
        return null;
      }

      if (!isSignedIn) {
        setDashboard({ data: null, status: "error", error: "Sign in to load dashboard data." });
        return null;
      }

      if (!options?.force && dashboard.status === "ready" && dashboard.data) {
        return dashboard.data;
      }

      if (!options?.force && inflightRef.current.dashboard) {
        return inflightRef.current.dashboard;
      }

      setDashboard((current) => ({
        data: options?.force ? null : current.data,
        status: "loading",
        error: ""
      }));

      const request = requestJson<DashboardSummary>("/api/dashboard/summary", { authMode: "clerk" })
        .then((payload) => {
          setDashboard({ data: payload, status: "ready", error: "" });
          return payload;
        })
        .catch((error) => {
          const message = resolveError(error, "Unable to load dashboard data.");
          setDashboard({ data: null, status: "error", error: message });
          return null;
        })
        .finally(() => {
          inflightRef.current.dashboard = null;
        });

      inflightRef.current.dashboard = request;
      return request;
    },
    [dashboard.data, dashboard.status, isLoaded, isSignedIn]
  );

  const ensureOrganization = useCallback(
    async (options?: { force?: boolean }) => {
      if (!isLoaded) {
        return null;
      }

      if (!isSignedIn) {
        setOrganization({
          data: null,
          status: "error",
          error: "Sign in through organization login to create or manage your organization."
        });
        return null;
      }

      if (!options?.force && organization.status === "ready" && organization.data) {
        return organization.data;
      }

      if (!options?.force && inflightRef.current.organization) {
        return inflightRef.current.organization;
      }

      setOrganization((current) => ({
        data: options?.force ? null : current.data,
        status: "loading",
        error: ""
      }));

      const request = requestJson<OrganizationSnapshot>("/api/organizations/current", { authMode: "clerk" })
        .then((payload) => {
          setOrganization({ data: payload, status: "ready", error: "" });
          return payload;
        })
        .catch((error) => {
          const message = resolveError(error, "Unable to load organization.");
          setOrganization({ data: null, status: "error", error: message });
          return null;
        })
        .finally(() => {
          inflightRef.current.organization = null;
        });

      inflightRef.current.organization = request;
      return request;
    },
    [isLoaded, isSignedIn, organization.data, organization.status]
  );

  const ensurePolicies = useCallback(
    async (options?: { force?: boolean }) => {
      if (!isLoaded) {
        return null;
      }

      if (!isSignedIn) {
        setPolicies({ data: null, status: "error", error: "Sign in to load policies." });
        return null;
      }

      if (!options?.force && policies.status === "ready" && policies.data) {
        return policies.data;
      }

      if (!options?.force && inflightRef.current.policies) {
        return inflightRef.current.policies;
      }

      setPolicies((current) => ({
        data: options?.force ? null : current.data,
        status: "loading",
        error: ""
      }));

      const request = requestJson<PolicyRecord[]>("/api/policies", { authMode: "clerk" })
        .then((payload) => {
          setPolicies({ data: payload, status: "ready", error: "" });
          return payload;
        })
        .catch((error) => {
          const message = resolveError(error, "Unable to load policies.");
          setPolicies({ data: null, status: "error", error: message });
          return null;
        })
        .finally(() => {
          inflightRef.current.policies = null;
        });

      inflightRef.current.policies = request;
      return request;
    },
    [isLoaded, isSignedIn, policies.data, policies.status]
  );

  const ensureBilling = useCallback(
    async (options?: { force?: boolean }) => {
      if (!isLoaded) {
        return null;
      }

      if (!isSignedIn) {
        setBilling({ data: null, status: "error", error: "Sign in to load billing records." });
        return null;
      }

      if (!options?.force && billing.status === "ready" && billing.data) {
        return billing.data;
      }

      if (!options?.force && inflightRef.current.billing) {
        return inflightRef.current.billing;
      }

      setBilling((current) => ({
        data: options?.force ? null : current.data,
        status: "loading",
        error: ""
      }));

      const request = requestJson<BillingResponse>("/api/billing/current", { authMode: "clerk" })
        .then((payload) => {
          setBilling({ data: payload, status: "ready", error: "" });
          return payload;
        })
        .catch((error) => {
          const message = resolveError(error, "Unable to load billing records.");
          setBilling({ data: null, status: "error", error: message });
          return null;
        })
        .finally(() => {
          inflightRef.current.billing = null;
        });

      inflightRef.current.billing = request;
      return request;
    },
    [billing.data, billing.status, isLoaded, isSignedIn]
  );

  const invalidateDashboard = useCallback(() => {
    inflightRef.current.dashboard = null;
    setDashboard(emptySlice());
  }, []);

  const invalidateOrganization = useCallback(() => {
    inflightRef.current.organization = null;
    setOrganization(emptySlice());
  }, []);

  const invalidatePolicies = useCallback(() => {
    inflightRef.current.policies = null;
    setPolicies(emptySlice());
  }, []);

  const invalidateBilling = useCallback(() => {
    inflightRef.current.billing = null;
    setBilling(emptySlice());
  }, []);

  const value = useMemo<OrganizationWorkspaceContextValue>(
    () => ({
      authReady: isLoaded,
      isSignedIn: Boolean(isSignedIn),
      dashboard,
      organization,
      policies,
      billing,
      ensureDashboard,
      ensureOrganization,
      ensurePolicies,
      ensureBilling,
      invalidateDashboard,
      invalidateOrganization,
      invalidatePolicies,
      invalidateBilling
    }),
    [
      billing,
      dashboard,
      ensureBilling,
      ensureDashboard,
      ensureOrganization,
      ensurePolicies,
      invalidateBilling,
      invalidateDashboard,
      invalidateOrganization,
      invalidatePolicies,
      isLoaded,
      isSignedIn,
      organization,
      policies
    ]
  );

  return <OrganizationWorkspaceContext.Provider value={value}>{children}</OrganizationWorkspaceContext.Provider>;
}

export function useOrganizationWorkspace() {
  const context = useContext(OrganizationWorkspaceContext);
  if (!context) {
    throw new Error("useOrganizationWorkspace must be used within OrganizationWorkspaceProvider");
  }
  return context;
}
