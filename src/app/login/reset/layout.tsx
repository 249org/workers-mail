import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = privateMetadata("Reset password");

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
