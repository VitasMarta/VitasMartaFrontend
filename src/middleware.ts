import createMiddleware from "next-intl/middleware";
import { routing } from "@/core/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Excluye el BFF (/bff), assets de Next y archivos estáticos (con punto).
  matcher: ["/((?!bff|_next|_vercel|.*\\..*).*)"],
};
