import { ButtonHTMLAttributes, useState } from "react";

type SafeActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  run: () => Promise<void> | void;
  busyLabel?: string;
};

export function SafeActionButton({ run, children, busyLabel = "Working...", className = "", ...props }: SafeActionButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await run();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      {...props}
      type="button"
      disabled={busy || props.disabled}
      onClick={() => {
        void handleClick();
      }}
      className={`db-wf-btn db-wf-btn--primary ${className}`.trim()}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
