"use client";

import { useState } from "react";
import { GitBranch, Copy, Check, RotateCcw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { TypingBubbles } from "./TypingBubbles";

type CodeProps = React.ComponentPropsWithoutRef<'code'> & {
  node?: any;
  inline?: boolean;
};

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
  branches?: Message[];
  onBranchClick?: (branchId: string) => void;
  onTextSelect?: (params: {
    messageId: string;
    selectedText: string;
    charStart: number;
    charEnd: number;
  }) => void;
  isFailed?: boolean;
  onRetry?: (messageId: string) => void;
  onEditResend?: (messageId: string) => void;
}

// Preprocess content to fix common LaTeX escaping issues from LLMs
function preprocessLatex(text: string): string {
  let processed = text;

  // Convert \[ \] to $$ $$ for display math
  // Note: In JS String.replace, '$$' is a special pattern that inserts a literal '$'.
  // We must use a function replacer to output literal '$$'.
  processed = processed.replace(/\\\[/g, () => '$$');
  processed = processed.replace(/\\\]/g, () => '$$');

  // Convert \( \) to $ $ for inline math
  processed = processed.replace(/\\\(/g, '$');
  processed = processed.replace(/\\\)/g, '$');

  return processed;
}

export function MessageBubble({
  message,
  isStreaming,
  streamingContent,
  branches,
  onBranchClick,
  onTextSelect,
  isFailed,
  onRetry,
  onEditResend,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const rawContent = isStreaming ? streamingContent || "" : (streamingContent || message.content);
  const content = preprocessLatex(rawContent);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMouseUp = () => {
    if (!onTextSelect) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const container = document.getElementById(`message-content-${message.id}`);
    if (!container || !container.contains(range.startContainer) || !container.contains(range.endContainer)) return;

    // Calculate character offsets by walking text nodes (matches restore logic)
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let charStart = 0;
    let charEnd = 0;
    let foundStart = false;
    let foundEnd = false;

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const len = node.length;

      if (!foundStart && node === range.startContainer) {
        charStart = pos + range.startOffset;
        foundStart = true;
      }
      if (!foundEnd && node === range.endContainer) {
        charEnd = pos + range.endOffset;
        foundEnd = true;
        break;
      }
      pos += len;
    }

    if (!foundStart || !foundEnd) return;

    onTextSelect({
      messageId: message.id,
      selectedText: text,
      charStart,
      charEnd,
    });
  };

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group flex items-start gap-1 py-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
        {onRetry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onRetry(message.id)}
            title="Retry"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        {onEditResend && isUser && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onEditResend(message.id)}
            title="Edit & Resend"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div
        className={cn(
          "relative rounded-lg px-4 overflow-hidden",
          isUser
            ? "max-w-[85%] md:max-w-[50%] bg-primary text-primary-foreground py-0.2"
            : "max-w-[100%] bg-muted text-foreground py-3"
        )}
      >
        {message.isBranchRoot && (
          <div className="mt-2 -mb-2 flex items-center gap-1 text-xs opacity-70">
            <GitBranch className="h-3 w-3" />
            <span>Branch</span>
          </div>
        )}

        <div
          id={`message-content-${message.id}`}
          className="prose prose-sm dark:prose-invert max-w-none text-sm prose-p:my-2 prose-headings:my-3 prose-pre:p-0 prose-pre:bg-transparent prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto break-words overflow-wrap-anywhere [&_table]:block [&_table]:overflow-x-auto"
          style={{ overflowWrap: "anywhere" }}
          onMouseUp={handleMouseUp}
        >
          <Markdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({ children }) => <h1 className="text-2xl font-bold mt-4 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-xl font-semibold mt-3 mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-semibold mt-3 mb-1">{children}</h3>,
              h4: ({ children }) => <h4 className="text-base font-semibold mt-2 mb-1">{children}</h4>,
              code({ node, inline, className, children, ...props }: CodeProps) {
                const match = /language-(\w+)/.exec(className || "");
                const isBlock = !inline && (match || String(children).includes("\n"));

                if (isBlock) {
                  const language = match?.[1];
                  const codeString = String(children).replace(/\n$/, "");

                  return (
                    <div className="relative group/code my-2">
                      <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 bg-background/80 hover:bg-background"
                          onClick={() => navigator.clipboard.writeText(codeString)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {language && (
                        <div className="absolute left-2 top-2 text-xs text-muted-foreground opacity-70">
                          {language}
                        </div>
                      )}
                      <SyntaxHighlighter
                        style={oneDark}
                        language={language || "text"}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: "0.5rem",
                          fontSize: "0.8rem",
                          paddingTop: language ? "2rem" : "1rem",
                          overflowX: "auto",
                          maxWidth: "100%",
                        }}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </div>
                  );
                }

                // Inline code
                return (
                  <code className={cn("rounded bg-muted px-1.5 py-0.5 text-sm font-mono", className)} {...props}>
                    {children}
                  </code>
                );
              },
              p: ({ children }) => <p className="my-2">{children}</p>,
            }}
          >
            {content}
          </Markdown>
          {isStreaming && <TypingBubbles />}
        </div>

        {branches && branches.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {branches.map((branch) => (
              <Button
                key={branch.id}
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={() => onBranchClick?.(branch.id)}
              >
                <GitBranch className="h-3 w-3" />
                {branch.branchContext?.slice(0, 20) || "Branch"}
              </Button>
            ))}
          </div>
        )}

        {isFailed && (
          <div className="mt-0.5">
            <span className="text-xs text-destructive">Failed to get response</span>
          </div>
        )}
      </div>
    </div>
  );
}
