import { setRequestLocale } from "next-intl/server";
import { HomeView } from "@/features/catalogo/HomeView";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <HomeView />;
}
