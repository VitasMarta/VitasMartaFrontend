"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/layout";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <Container className="py-20">
      <h1>{t("error.title")}</h1>
      <p className="mt-3 max-w-xl text-lg">{t("error.body")}</p>
      {error.digest && (
        <p className="meta mt-2 text-ink/80">
          {t("reference")}: <span className="font-mono">{error.digest}</span>
        </p>
      )}
      <Button className="mt-6" onClick={reset}>
        {t("retry")}
      </Button>
    </Container>
  );
}
