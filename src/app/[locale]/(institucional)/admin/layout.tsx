import type { ReactNode } from "react";
import { AdminShell } from "@/features/institucional/AdminViews";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
