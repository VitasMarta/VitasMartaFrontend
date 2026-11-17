import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Dominio del CDN (Cloudflare R2) aún por definir; se declara aquí cuando exista.
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);
