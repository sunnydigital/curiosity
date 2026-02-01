"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function createAndRedirect() {
      const res = await fetch("/api/chat", { method: "POST" });
      const data = await res.json();
      router.push(`/chat/${data.id}`);
    }
    createAndRedirect();
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground">Creating new chat...</div>
    </div>
  );
}
