"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AuthInfo {
  authenticated: boolean;
  userId?: string;
  email?: string;
  isAdmin?: boolean;
  rateLimit?: { remaining: number; total: number; isLimited: boolean };
}

export function UserMenu() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Re-fetch auth on mount and whenever the route changes (e.g. after login redirect)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => {});
  }, [pathname]);

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.refresh();
    window.location.href = "/";
  };

  if (!auth) return null;

  if (!auth.authenticated) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={() => router.push("/auth/login")}>
            <LogIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Sign in {auth.rateLimit ? `(${auth.rateLimit.remaining}/${auth.rateLimit.total} messages left)` : ""}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <User className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-sm text-muted-foreground">
          {auth.email}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
