"use client";

import { memo, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { GitBranch, Trash2, HelpCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/types";

// Generate a summary for display in tree nodes
function generateSummary(message: Message): string {
  // Use previewSummary if available
  if (message.previewSummary) {
    return message.previewSummary;
  }

  const content = message.content.trim();
  const isUser = message.role === "user";

  if (isUser) {
    // For user messages, try to extract the question or main topic
    // Look for question marks
    const questionMatch = content.match(/^[^.!?]*\?/);
    if (questionMatch) {
      const question = questionMatch[0].trim();
      if (question.length <= 80) return question;
      return question.slice(0, 77) + "...";
    }
    // Otherwise just use first sentence or truncate
    const firstSentence = content.match(/^[^.!?]+[.!?]?/);
    if (firstSentence && firstSentence[0].length <= 80) {
      return firstSentence[0].trim();
    }
  } else {
    // For AI messages, try to get the key point
    // Skip headers and get first substantive content
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length > 0) {
      const firstLine = lines[0].replace(/^\*\*|\*\*$/g, '').trim();
      if (firstLine.length <= 80) return firstLine;
      return firstLine.slice(0, 77) + "...";
    }
  }

  // Fallback: just truncate
  if (content.length <= 80) return content;
  return content.slice(0, 77) + "...";
}

function TreeNodeComponent(props: NodeProps) {
  const data = props.data as any;
  const message = data.message as Message;
  const isActive = data.isActive as boolean;
  const isTrunk = data.isTrunk as boolean;
  const onDelete = data.onDelete as ((messageId: string) => void) | undefined;
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isUser = message.role === "user";
  const isBranch = message.isBranchRoot;
  // Only allow deleting branch root nodes (the entry point of a branch)
  const canDelete = isBranch && onDelete;

  // Generate summary for display
  const summary = useMemo(() => generateSummary(message), [message]);

  // Pick CSS variable names based on node type
  const bgVar = isTrunk
    ? isUser ? "--tree-node-trunk-user-bg" : "--tree-node-trunk-ai-bg"
    : isBranch
      ? "--tree-node-branch-bg"
      : isUser ? "--tree-node-other-user-bg" : "--tree-node-other-ai-bg";

  const borderVar = isTrunk
    ? isUser ? "--tree-node-trunk-user-border" : "--tree-node-trunk-ai-border"
    : isBranch
      ? "--tree-node-branch-border"
      : isUser ? "--tree-node-other-user-border" : "--tree-node-other-ai-border";

  const iconColorVar = isUser ? "--tree-user-icon" : "--tree-ai-icon";

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canDelete) {
      setShowDeleteModal(true);
    }
  };

  const confirmDelete = () => {
    onDelete!(message.id);
    setShowDeleteModal(false);
  };

  return (
    <>
      <div
        className={cn(
          "group rounded-lg border px-3 py-2 text-xs shadow-sm transition-colors relative",
          "w-[200px] h-[80px]",
          isActive && "ring-2 ring-primary"
        )}
        style={{
          backgroundColor: `var(${bgVar})`,
          borderColor: `var(${borderVar})`,
        }}
      >
        {/* Top/Bottom handles for all connections */}
        <Handle id="top" type="target" position={Position.Top} className="!bg-border" />
        <Handle id="bottom" type="source" position={Position.Bottom} className="!bg-border" />

        {canDelete && (
          <button
            onClick={handleDeleteClick}
            className="absolute right-1 top-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90 z-50"
            title="Delete branch"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}

        <div className="mb-1 flex items-center gap-1.5">
          {isUser ? (
            <HelpCircle className="h-3 w-3" style={{ color: `var(${iconColorVar})` }} />
          ) : (
            <MessageSquare className="h-3 w-3" style={{ color: `var(${iconColorVar})` }} />
          )}
          {isBranch && <GitBranch className="h-3 w-3" style={{ color: "var(--tree-branch-icon)" }} />}
          <span className="text-[10px] text-muted-foreground font-medium">
            {isUser ? "Question" : "Answer"}
          </span>
        </div>
        <div className="text-foreground line-clamp-3 leading-tight">
          {summary}
        </div>
      </div>

      {showDeleteModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Delete branch</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete this branch and all its messages.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export const TreeNodeMemo = memo(TreeNodeComponent);
