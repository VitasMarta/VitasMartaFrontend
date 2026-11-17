"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/core/i18n/navigation";
import { canAccess, type Area } from "./rbacGuard";
import { useSessionStore } from "./sessionStore";
import { StatusBlock } from "@/shared/ui/StatusBlock";

/**
 * Protege un área de la UI por rol. Anónimo → redirige a login conservando la ruta de retorno;
 * rol insuficiente → pantalla de acceso denegado (el backend responde 403 de todos modos).
 */
export function RequireRole({ area, children }: { area: Area; children: ReactNode }) {
  const t = useTranslations("common");
  const status = useSessionStore((s) => s.status);
  const rol = useSessionStore((s) => s.user?.rol);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?volver=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "unknown" || status === "anonymous") return <StatusBlock kind="loading" title={t("loading")} />;

  if (!canAccess(rol, area)) {
    return (
      <StatusBlock kind="error" title={t("forbidden.title")}>
        <p>{t("forbidden.body")}</p>
        <Link href="/" className="text-link mt-3 inline-block font-semibold">
          {t("forbidden.home")}
        </Link>
      </StatusBlock>
    );
  }
  return <>{children}</>;
}
