"use client";

/**
 * Three-dot typing indicator that highlights left-to-right in sequence.
 */
export function TypingBubbles() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-current animate-typing-dot"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}
