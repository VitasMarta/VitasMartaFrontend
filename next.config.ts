import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Dominio del CDN (Cloudflare R2) aún por definir; se declara aquí cuando exista.
    remotePatterns: [],
  },
  /**
   * Rutas que usan los enlaces de los correos (M7 genera /verificacion y /recuperacion; M10 agrega
   * /reservas/{codigo}, /prestador y /reportes) → páginas reales del portal. La query (?token=…) se
   * conserva y el middleware de idioma agrega el prefijo (/es-CO, /en-US).
   */
  async redirects() {
    return [
      { source: "/recuperacion", destination: "/restablecer", permanent: false },
      { source: "/reservas/RSV-:ref", destination: "/mis-reservas/:ref", permanent: false },
      { source: "/reservas/:codigo*", destination: "/mis-reservas", permanent: false },
      { source: "/prestador", destination: "/onboarding", permanent: false },
      { source: "/reportes", destination: "/analitica", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
