"use client";

interface FirstRunHintProps {
  text: string;
  onDismiss?: () => void;
}

export function FirstRunHint({ text, onDismiss }: FirstRunHintProps) {
  return (
    <div className="mt-2 flex items-start justify-between gap-3 rounded-md border border-indigo/30 bg-indigo/5 px-3 py-2">
      <p className="text-xs text-indigo-200">{text}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[11px] text-indigo/80 transition-colors hover:text-indigo-200"
        >
          Hide tip
        </button>
      )}
    </div>
  );
}
