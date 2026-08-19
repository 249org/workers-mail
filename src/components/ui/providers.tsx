"use client";

import { ContextMenuProvider } from "./context-menu";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <ContextMenuProvider>{children}</ContextMenuProvider>;
}
