"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/**
 * Listens for Supabase auth state changes (e.g. OAuth implicit flow callback)
 * and refreshes the page so server-side middleware picks up the session cookies.
 */
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Session detected client-side — refresh so middleware syncs cookies
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
