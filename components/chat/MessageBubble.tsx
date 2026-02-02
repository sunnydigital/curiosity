"use client";

import { useState } from "react";
import { GitBranch, Copy, Check, RotateCcw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { TypingBubbles } from "./TypingBubbles";

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
  processed = processed.replace(/\\\[/g, '$$');
  processed = processed.replace(/\\\]/g, '$$');

  // Convert \( \) to $ $ for inline math
  processed = processed.replace(/\\\(/g, '$');
  processed = processed.replace(/\\\)/g, '$');

  // Fix double-escaped backslashes in LaTeX commands within math blocks
  // e.g., \\frac -> \frac, \\sqrt -> \sqrt, \\sum -> \sum
  // This handles cases where JSON escaping doubled the backslashes
  processed = processed.replace(/(\$\$?)([^$]+?)(\$\$?)/g, (match, open, content, close) => {
    // Within math blocks, fix double backslashes for common LaTeX commands
    const fixedContent = content
      .replace(/\\\\frac/g, '\\frac')
      .replace(/\\\\sqrt/g, '\\sqrt')
      .replace(/\\\\sum/g, '\\sum')
      .replace(/\\\\int/g, '\\int')
      .replace(/\\\\prod/g, '\\prod')
      .replace(/\\\\lim/g, '\\lim')
      .replace(/\\\\infty/g, '\\infty')
      .replace(/\\\\pi/g, '\\pi')
      .replace(/\\\\alpha/g, '\\alpha')
      .replace(/\\\\beta/g, '\\beta')
      .replace(/\\\\gamma/g, '\\gamma')
      .replace(/\\\\delta/g, '\\delta')
      .replace(/\\\\theta/g, '\\theta')
      .replace(/\\\\lambda/g, '\\lambda')
      .replace(/\\\\sigma/g, '\\sigma')
      .replace(/\\\\omega/g, '\\omega')
      .replace(/\\\\partial/g, '\\partial')
      .replace(/\\\\nabla/g, '\\nabla')
      .replace(/\\\\cdot/g, '\\cdot')
      .replace(/\\\\times/g, '\\times')
      .replace(/\\\\left/g, '\\left')
      .replace(/\\\\right/g, '\\right')
      .replace(/\\\\text/g, '\\text')
      .replace(/\\\\mathrm/g, '\\mathrm')
      .replace(/\\\\mathbf/g, '\\mathbf')
      .replace(/\\\\vec/g, '\\vec')
      .replace(/\\\\hat/g, '\\hat')
      .replace(/\\\\bar/g, '\\bar')
      .replace(/\\\\overline/g, '\\overline')
      .replace(/\\\\underline/g, '\\underline')
      .replace(/\\\\begin/g, '\\begin')
      .replace(/\\\\end/g, '\\end')
      .replace(/\\\\leq/g, '\\leq')
      .replace(/\\\\geq/g, '\\geq')
      .replace(/\\\\neq/g, '\\neq')
      .replace(/\\\\approx/g, '\\approx')
      .replace(/\\\\equiv/g, '\\equiv')
      .replace(/\\\\pm/g, '\\pm')
      .replace(/\\\\mp/g, '\\mp')
      .replace(/\\\\div/g, '\\div')
      .replace(/\\\\\^/g, '^')  // Fix escaped caret for superscripts
      .replace(/\\\\_/g, '_');  // Fix escaped underscore for subscripts
    return open + fixedContent + close;
  });

  // Fix escaped dollar signs that should be LaTeX delimiters: \$ -> $
  processed = processed.replace(/\\\$\\\$/g, '$$');
  processed = processed.replace(/\\\$/g, '$');

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
  const rawContent = isStreaming ? streamingContent || "" : message.content;
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
    if (!container || !container.contains(range.startContainer)) return;

    // Calculate character offsets relative to the message content
    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const charStart = preRange.toString().length;
    const charEnd = charStart + text.length;

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
          "relative rounded-lg px-4",
          isUser
            ? "max-w-[50%] bg-primary text-primary-foreground py-0.2"
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
          className="prose prose-sm dark:prose-invert max-w-none text-sm prose-p:my-2 prose-headings:my-3 prose-pre:p-0 prose-pre:bg-transparent prose-code:before:content-none prose-code:after:content-none [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto"
          onMouseUp={handleMouseUp}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
            rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: 'html' }], rehypeRaw]}
            components={{
              code: ({ node, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || "");
                const isCodeBlock = node?.position?.start?.line !== node?.position?.end?.line || match;

                if (isCodeBlock) {
                  const language = match ? match[1] : "text";
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
                      {match && (
                        <div className="absolute left-2 top-2 text-xs text-muted-foreground opacity-70">
                          {language}
                        </div>
                      )}
                      <SyntaxHighlighter
                        style={oneDark}
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: "0.5rem",
                          fontSize: "0.8rem",
                          paddingTop: match ? "2rem" : "1rem",
                        }}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </div>
                  );
                }

                // Inline code
                return (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>
                    {children}
                  </code>
                );
              },
              // Better paragraph handling for math
              p: ({ children }) => <p className="my-2">{children}</p>,
              // Ensure math blocks render properly
              span: ({ className, children, ...props }) => {
                if (className?.includes("katex")) {
                  return <span className={className} {...props}>{children}</span>;
                }
                return <span {...props}>{children}</span>;
              },
            }}
          >
            {content}
          </ReactMarkdown>
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
          <div className="mt-2">
            <span className="text-xs text-destructive">Failed to get response</span>
          </div>
        )}
      </div>
    </div>
  );
}
