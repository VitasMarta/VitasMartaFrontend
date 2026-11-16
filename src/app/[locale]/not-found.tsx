import { useTranslations } from "next-intl";
import { ButtonLink } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/layout";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <Container className="py-20">
      <p className="meta uppercase tracking-wider">404</p>
      <h1 className="mt-2">{t("notFound.title")}</h1>
      <p className="mt-3 max-w-xl text-lg">{t("notFound.body")}</p>
      <ButtonLink href="/" className="mt-6">
        {t("forbidden.home")}
      </ButtonLink>
    </Container>
  );
}
