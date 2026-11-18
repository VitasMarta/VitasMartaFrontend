"use client";

import { useTranslations } from "next-intl";
import { GATEWAY_URL } from "@/core/config/gateway";
import { DefinitionRows } from "@/shared/ui/layout";

/**
 * Guía de la API de integración de disponibilidad de M4 (SP-09):
 * `PUT /api/v1/prestadores/integracion/disponibilidad/{contenido_id}` con `X-Api-Key`
 * (scope `disponibilidad:escribir`) e `Idempotency-Key`. Cuerpo: `DisponibilidadExternaDTO`.
 */
const RUTA = "/api/v1/prestadores/integracion/disponibilidad/{contenido_id}";

const CUERPO = `{
  "version_esperada": 3,
  "reemplazar": false,
  "franjas": [
    {
      "fecha": "2026-12-01",
      "hora_inicio": "09:00",
      "hora_fin": "12:00",
      "cupo_total": 20,
      "cupo_disponible": 20,
      "estado": "disponible"
    }
  ]
}`;

function Codigo({ children, etiqueta }: { children: string; etiqueta: string }) {
  return (
    <pre aria-label={etiqueta} translate="no" className="notranslate overflow-x-auto rounded-lg bg-ink px-4 py-3 text-[0.8125rem] leading-relaxed text-mist">
      <code>{children}</code>
    </pre>
  );
}

export function GuiaApiIntegracion() {
  const t = useTranslations("admin.credentials.guide");
  const base = GATEWAY_URL.replace(/\/+$/, "");
  const curl = `curl -X PUT "${base}${RUTA.replace("{contenido_id}", "<ID_DEL_CONTENIDO>")}" \\
  -H "X-Api-Key: <CLAVE_EMITIDA>" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '${CUERPO.replace(/\n\s*/g, " ")}'`;

  return (
    <section aria-labelledby="guia-api" className="card mt-10 space-y-5 p-5 sm:p-7">
      <div>
        <h2 id="guia-api" className="!text-xl">{t("title")}</h2>
        <p className="mt-2 max-w-3xl text-ink/90">{t("intro")}</p>
      </div>

      <DefinitionRows rows={[
        { term: t("method"), value: <code translate="no" className="notranslate break-all font-mono text-sm">PUT {base}{RUTA}</code> },
        { term: t("auth"), value: <span><code className="font-mono text-sm">X-Api-Key</code> — {t("authDesc")}</span> },
        { term: t("idem"), value: <span><code className="font-mono text-sm">Idempotency-Key</code> — {t("idemDesc")}</span> },
        { term: t("contentId"), value: t("contentIdDesc") },
      ]} />

      <div className="space-y-2">
        <h3 className="text-[1rem] font-semibold text-ink">{t("bodyTitle")}</h3>
        <Codigo etiqueta={t("bodyTitle")}>{CUERPO}</Codigo>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink/85">
          <li><code className="font-mono">version_esperada</code> — {t("fieldVersion")}</li>
          <li><code className="font-mono">reemplazar</code> — {t("fieldReplace")}</li>
          <li><code className="font-mono">estado</code> — {t("fieldState")}</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-[1rem] font-semibold text-ink">{t("exampleTitle")}</h3>
        <Codigo etiqueta={t("exampleTitle")}>{curl}</Codigo>
      </div>

      <div className="space-y-2">
        <h3 className="text-[1rem] font-semibold text-ink">{t("responsesTitle")}</h3>
        <ul className="space-y-1 text-sm text-ink/85">
          {(["200", "400", "401", "403", "404", "409", "429"] as const).map((c) => (
            <li key={c}><code className="font-mono font-semibold">{c}</code> — {t(`responses.${c}`)}</li>
          ))}
        </ul>
      </div>

      <p className="rounded-lg bg-page px-4 py-3 text-sm text-ink/80">{t("security")}</p>
    </section>
  );
}
