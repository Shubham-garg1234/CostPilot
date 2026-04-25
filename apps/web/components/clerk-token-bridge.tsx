"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { registerTokenGetter } from "../lib/api";

export function ClerkTokenBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

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

  return null;
}
