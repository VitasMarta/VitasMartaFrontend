import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Link / redirect / useRouter / usePathname conscientes del locale. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
