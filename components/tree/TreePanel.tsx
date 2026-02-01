"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TreeVisualization } from "./TreeVisualization";
import type { Message } from "@/types";

interface TreePanelProps {
  messages: Message[];
  activeIds: Set<string>;
  isOpen: boolean;
  onClose: () => void;
  onNodeClick?: (messageId: string) => void;
  onDeleteBranch?: (messageId: string) => void;
}

export function TreePanel({
  messages,
  activeIds,
  isOpen,
  onClose,
  onNodeClick,
  onDeleteBranch,
}: TreePanelProps) {
  const [width, setWidth] = useState(320);
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(250, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="relative flex h-full flex-col border-l border-border bg-background"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/50 z-10 flex items-center"
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="h-6 w-6 -ml-2.5 text-muted-foreground opacity-0 hover:opacity-100" />
      </div>

      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Chat Tree</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1">
        <TreeVisualization
          messages={messages}
          activeIds={activeIds}
          onNodeClick={onNodeClick}
          onDeleteBranch={onDeleteBranch}
        />
      </div>
    </div>
  );
}
