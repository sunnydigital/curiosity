"use client";

import { useCallback } from "react";
import { Twitter, Linkedin, Share2, FileJson, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message, Chat } from "@/types";

interface ChatActionsProps {
  chatId: string;
  chatTitle: string;
  messages: Message[];
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function messagesToMarkdown(title: string, messages: Message[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const msg of messages) {
    const label = msg.role === "user" ? "User" : "Assistant";
    lines.push(`## ${label}`, "", msg.content, "");
  }
  return lines.join("\n");
}

function buildShareText(title: string, messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const excerpt = firstUser
    ? firstUser.content.slice(0, 100) + (firstUser.content.length > 100 ? "..." : "")
    : "";
  return `${title}${excerpt ? `\n\n"${excerpt}"` : ""}\n\nExplored with Curiosity`;
}

export function ChatActions({ chatId, chatTitle, messages }: ChatActionsProps) {
  const shareText = buildShareText(chatTitle, messages);

  const shareToX = useCallback(() => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [shareText]);

  const shareToReddit = useCallback(() => {
    const url = `https://reddit.com/submit?title=${encodeURIComponent(chatTitle)}&selftext=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [chatTitle, shareText]);

  const shareToLinkedIn = useCallback(() => {
    const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [shareText]);

  const downloadJson = useCallback(async () => {
    try {
      const [chatRes, msgsRes] = await Promise.all([
        fetch(`/api/chat/${chatId}`),
        fetch(`/api/chat/${chatId}/messages`),
      ]);
      const chat: Chat = await chatRes.json();
      const allMessages: Message[] = await msgsRes.json();
      const data = { chat, messages: allMessages };
      const filename = `${chatTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "chat"}.json`;
      triggerDownload(JSON.stringify(data, null, 2), filename, "application/json");
    } catch (err) {
      console.error("Failed to download JSON:", err);
    }
  }, [chatId, chatTitle]);

  const downloadMarkdown = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${chatId}/messages`);
      const allMessages: Message[] = await res.json();
      const md = messagesToMarkdown(chatTitle, allMessages);
      const filename = `${chatTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "chat"}.md`;
      triggerDownload(md, filename, "text/markdown");
    } catch (err) {
      console.error("Failed to download Markdown:", err);
    }
  }, [chatId, chatTitle]);

  return (
    <div className="flex items-center justify-center gap-1 py-3 flex-wrap max-w-full px-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={shareToX}
        title="Share to X"
      >
        <Twitter className="h-3.5 w-3.5" />
        X
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={shareToReddit}
        title="Share to Reddit"
      >
        <Share2 className="h-3.5 w-3.5" />
        Reddit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={shareToLinkedIn}
        title="Share to LinkedIn"
      >
        <Linkedin className="h-3.5 w-3.5" />
        LinkedIn
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={downloadJson}
        title="Download as JSON"
      >
        <FileJson className="h-3.5 w-3.5" />
        JSON
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={downloadMarkdown}
        title="Download as Markdown"
      >
        <FileText className="h-3.5 w-3.5" />
        Markdown
      </Button>
    </div>
  );
}
