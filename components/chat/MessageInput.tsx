"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, ImagePlus, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageInputProps {
  onSend: (content: string, image?: File) => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  supportsImages?: boolean;
  initialContent?: string | null;
  onInitialContentConsumed?: () => void;
}

export function MessageInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  supportsImages = false,
  initialContent,
  onInitialContentConsumed,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Pre-fill textarea when initialContent is provided (edit & resend flow)
  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
      onInitialContentConsumed?.();
      // Focus and move cursor to end
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        }
      }, 0);
    }
  }, [initialContent, onInitialContentConsumed]);

  // Auto-resize textarea up to 5 rows
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const maxHeight = lineHeight * 5 + 16; // 5 rows + padding
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [content]);

  // Auto-dismiss notification
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed, image || undefined);
    setContent("");
    setImage(null);
    setImagePreview(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageClick = useCallback(() => {
    if (!supportsImages) {
      setNotification("The current model does not support image attachments.");
      return;
    }
    fileInputRef.current?.click();
  }, [supportsImages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNotification("Only image files are supported.");
      return;
    }

    setImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);

    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const removeImage = () => {
    setImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  return (
    <div className="border-t border-border p-4">
      {notification && (
        <div className="mx-auto mb-2 max-w-3xl rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {notification}
        </div>
      )}

      {imagePreview && (
        <div className="mx-auto mb-2 max-w-3xl">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="h-20 rounded-md border border-border object-cover"
            />
            <button
              onClick={removeImage}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleImageClick}
          title="Attach image"
          className="shrink-0"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          className="min-h-[44px] resize-none overflow-y-auto"
          rows={1}
          disabled={disabled}
        />
        {isLoading ? (
          <Button variant="destructive" size="icon" onClick={onStop}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!content.trim() || disabled}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
