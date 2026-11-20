import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--popover)",
          border: "0",
          color: "var(--foreground)",
          boxShadow: "var(--shadow-pop)",
          borderRadius: "0.75rem",
          fontSize: "13px",
        },
      }}
    />
  );
}
