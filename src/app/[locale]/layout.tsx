import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/core/i18n/routing";
import { Providers } from "@/core/providers/Providers";
import { BannerHost } from "@/shared/ui/BannerHost";
import { SiteFooter, SiteHeader, SkipLink } from "@/shared/ui/SiteChrome";
import { TraductorGoogle } from "@/shared/ui/TraductorGoogle";
import "../globals.css";

// Poppins con precarga, subconjunto latin y display swap (RNF-03-3 / LCP).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: { default: "VITASMARTA", template: "%s · VITASMARTA" }, description: t("footer.tagline") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={poppins.variable}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <Providers>
            <SkipLink />
            <SiteHeader />
            <BannerHost />
            <main id="contenido-principal" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <SiteFooter />
            <TraductorGoogle />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
