"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { clearEmployeeAccessToken, registerTokenGetter } from "../lib/api";

export function ClerkTokenBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    registerTokenGetter(async () => {
      if (!isLoaded || !isSignedIn) {
        return null;
      }

      return await getToken();
    });

    return () => {
      registerTokenGetter(null);
    };
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (wasSignedIn.current && !isSignedIn) {
      clearEmployeeAccessToken();
    }

    wasSignedIn.current = Boolean(isSignedIn);
  }, [isLoaded, isSignedIn]);

  return null;
}
