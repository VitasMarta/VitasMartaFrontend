"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/core/api/errorNormalizer";
import { RequireRole } from "@/core/auth/RequireRole";
import { formatBytes, formatDate, localized } from "@/core/format";
import { Link, useRouter } from "@/core/i18n/navigation";
import { useUiStore } from "@/core/store/uiStore";
import { useDocumentTitle } from "@/shared/hooks";
import { Button, ButtonLink } from "@/shared/ui/Button";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { CheckboxField, ErrorSummary, SelectField, TextAreaField, TextField } from "@/shared/ui/forms";
import { StatusTag, type Tone } from "@/shared/ui/indicators";
import { Container, PageHeader } from "@/shared/ui/layout";
import { Pagination } from "@/shared/ui/Pagination";
import { SlideOver } from "@/shared/ui/SlideOver";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { Tabs } from "@/shared/ui/Tabs";
import {
  PAGE_SIZE,
  useAccionContenido,
  useContenido,
  useFranjaActions,
  useFranjasM4,
  useGuardarContenido,
  useHistorial,
  useMultimediaActions,
  useMultimediaM4,
  useOferta,
  type FranjaM4,
} from "./api";
import { ESTADOS_EDITABLES, TIPOS, fieldsFor, toBody, toFormValues, type Contenido, type FieldDef, type Tipo } from "./offer";

const TONE: Record<string, Tone> = { publicado: "good", en_revision: "warn", aprobado: "info", borrador: "neutral", rechazado: "bad", archivado: "neutral" };
export function EstadoTag({ estado }: { estado: string }) {
  const t = useTranslations("prestador.states");
  return <StatusTag tone={TONE[estado] ?? "neutral"}>{t.has(estado) ? t(estado) : estado}</StatusTag>;
}

// ── Listado de la oferta ────────────────────────────────────────────────────────────────────────
function OfferTable({ tipo }: { tipo: Tipo }) {
  const t = useTranslations("prestador.offer");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const q = useOferta(tipo, page);
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ButtonLink href={`/mi-oferta/${tipo}/nuevo`}>{t("new", { type: t(`types.${tipo}`) })}</ButtonLink>
      </div>
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && (
        <>
          <EditorialTable
            caption={t(`types.${tipo}`)}
            rows={q.data.items}
            rowKey={(r) => r.id}
            empty={t("empty")}
            columns={[
              { key: "n", header: t("name"), cell: (r) => <span className="font-semibold">{localized(r.nombre, locale) || r.id}</span> },
              { key: "e", header: tc("status"), cell: (r) => <EstadoTag estado={r.estado} /> },
              { key: "v", header: t("version"), align: "right", cell: (r) => r.version },
              {
                key: "a",
                header: <span className="sr-only">{tc("actions")}</span>,
                cell: (r) => (
                  <Link href={`/mi-oferta/${tipo}/${r.id}`} className="text-link font-semibold">
                    {tc("edit")}
                    <span className="sr-only"> {localized(r.nombre, locale)}</span>
                  </Link>
                ),
              },
            ]}
          />
          <Pagination base={1} page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

export function OfferListView() {
  const t = useTranslations("prestador.offer");
  const [tab, setTab] = useState<string>("atractivos");
  useDocumentTitle(t("title"));
  return (
    <RequireRole area="prestador">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <Tabs label={t("title")} value={tab} onChange={setTab} tabs={TIPOS.map((tp) => ({ id: tp, label: t(`types.${tp}`), content: <OfferTable tipo={tp} /> }))} />
      </Container>
    </RequireRole>
  );
}

// ── Editor con versionado optimista (M4) ────────────────────────────────────────────────────────
function FieldInput({ def, value, error, onChange, tipo }: { def: FieldDef; value: string; error?: string; onChange: (v: string) => void; tipo: Tipo }) {
  const t = useTranslations("prestador.fields");
  const label = t.has(`${tipo}.${def.name}`) ? t(`${tipo}.${def.name}`) : t(def.name);
  const common = { label, name: def.name, value, error, required: def.required, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (def.kind === "textarea") return <TextAreaField {...common} rows={3} />;
  if (def.kind === "checkbox")
    return <CheckboxField label={label} name={def.name} checked={value === "true"} error={error} onChange={(e) => onChange(e.target.checked ? "true" : "")} />;
  if (def.kind === "select")
    return (
      <SelectField {...common}>
        <option value="" disabled>—</option>
        {def.options?.map((o) => <option key={o} value={o}>{t.has(`options.${o}`) ? t(`options.${o}`) : o}</option>)}
      </SelectField>
    );
  return <TextField {...common} type={def.kind ?? "text"} min={def.min} max={def.max} step={def.name === "lat" || def.name === "lng" ? "any" : undefined} />;
}

function ContentForm({ tipo, content }: { tipo: Tipo; content?: Contenido }) {
  const t = useTranslations("prestador.editor");
  const tc = useTranslations("common");
  const router = useRouter();
  const guardar = useGuardarContenido(tipo, content?.id);
  const latest = useContenido(tipo, content?.id);
  const [values, setValues] = useState<Record<string, string>>(() => toFormValues(tipo, content));
  const [version, setVersion] = useState(content?.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<ApiError | null>(null);
  const [upstream, setUpstream] = useState<string[]>([]);
  const editable = !content || ESTADOS_EDITABLES.includes(content.estado);
  const defs = fieldsFor(tipo);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    defs.filter((d) => d.required && !(values[d.name] ?? "").trim()).forEach((d) => (next[d.name] = t("required")));
    setErrors(next);
    if (Object.keys(next).length) return;
    setConflict(null);
    guardar.mutate(
      { body: toBody(tipo, values), version },
      {
        onSuccess: (saved) => {
          useUiStore.getState().push({ tone: "success", message: t("saved") });
          if (!content) router.replace(`/mi-oferta/${tipo}/${saved.id}`);
          else setVersion(saved.version);
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            if (error.isVersionConflict) setConflict(error);
            else {
              setErrors(error.fieldErrors());
              useUiStore.getState().push({ tone: "error", message: error.message, reference: error.correlationId });
            }
          }
        },
      },
    );
  };

  /** Conflicto 409: recarga la versión vigente SIN perder lo que el operador estaba redactando. */
  const reload = async () => {
    const fresh = (await latest.refetch()).data;
    if (!fresh) return;
    const server = toFormValues(tipo, fresh);
    setUpstream(Object.keys(server).filter((k) => server[k] !== (toFormValues(tipo, content)[k] ?? "") && server[k] !== values[k]));
    setVersion(fresh.version);
    setConflict(null);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-6">
      {conflict && (
        <div role="alert" className="rounded-md border border-l-4 border-preventive bg-card px-4 py-3">
          <p className="font-semibold">{t("conflictTitle")}</p>
          <p className="mt-1 text-sm">{conflict.message}</p>
          <p className="mt-1 text-sm">{t("conflictHelp")}</p>
          <Button className="mt-3" variant="secondary" onClick={reload} loading={latest.isFetching}>{t("reload")}</Button>
        </div>
      )}
      {upstream.length > 0 && (
        <p role="status" className="border-l-4 border-ink pl-3 text-sm">
          {t("reloaded", { version: version ?? 0 })} {t("changedUpstream", { fields: upstream.join(", ") })}
        </p>
      )}
      {!editable && <p role="status" className="border-l-4 border-ink pl-3">{t("readOnly")}</p>}
      <ErrorSummary errors={errors} title={tc("errorSummary")} />
      <fieldset disabled={!editable} className="card p-5 sm:p-6 grid gap-6 sm:grid-cols-2">
        <legend className="sr-only">{t("legend")}</legend>
        {defs.map((d) => (
          <div key={d.name} className={d.kind === "textarea" ? "sm:col-span-2" : undefined}>
            <FieldInput def={d} tipo={tipo} value={values[d.name] ?? ""} error={errors[d.name]} onChange={(v) => setValues((s) => ({ ...s, [d.name]: v }))} />
          </div>
        ))}
      </fieldset>
      {editable && <Button type="submit" loading={guardar.isPending}>{content ? tc("save") : t("create")}</Button>}
    </form>
  );
}

function EditorialPanel({ tipo, content }: { tipo: Tipo; content: Contenido }) {
  const t = useTranslations("prestador.editorial");
  const tc = useTranslations("common");
  const locale = useLocale();
  const hist = useHistorial(content.id);
  const accion = useAccionContenido(content.id);
  const [open, setOpen] = useState<"enviar-revision" | "corregir" | null>(null);
  const [error, setError] = useState<string>();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (!motivo) return setError(t("reasonRequired"));
    accion.mutate(
      { accion: open!, motivo, version: content.version },
      {
        onSuccess: () => {
          setOpen(null);
          useUiStore.getState().push({ tone: "success", message: t("done") });
        },
        onError: (err) => err instanceof ApiError && setError(err.message),
      },
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <p className="flex items-center gap-3">{t("current")}: <EstadoTag estado={content.estado} /></p>
      <div className="flex flex-wrap gap-3">
        {content.estado === "borrador" && <Button onClick={() => setOpen("enviar-revision")}>{t("submitReview")}</Button>}
        {content.estado === "publicado" && <Button variant="secondary" onClick={() => setOpen("corregir")}>{t("correct")}</Button>}
      </div>
      <section aria-labelledby="hist" className="card p-5 sm:p-6 card p-5 sm:p-6">
        <h2 id="hist" className="mb-1 !text-xl">{t("history")}</h2>
        {hist.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        <ol className="mt-3 divide-y divide-line rounded-md border border-line bg-card">
          {hist.data?.items.map((h, i) => (
            <li key={i} className="py-3">
              <p className="font-medium">{h.estado_origen} → {h.estado_destino}</p>
              <p className="meta text-ink/80">{formatDate(h.ocurrido_en, locale)} · v{h.version_resultante}{h.motivo ? ` · ${h.motivo}` : ""}</p>
            </li>
          ))}
        </ol>
      </section>
      <SlideOver open={open !== null} onClose={() => { setOpen(null); setError(undefined); }} title={open === "corregir" ? t("correct") : t("submitReview")}>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <p>{open === "corregir" ? t("correctHelp") : t("reviewHelp")}</p>
          <TextAreaField label={t("reason")} name="motivo" required error={error} />
          <div className="flex gap-3">
            <Button type="submit" loading={accion.isPending}>{tc("confirm")}</Button>
            <Button variant="secondary" onClick={() => setOpen(null)}>{tc("cancel")}</Button>
          </div>
        </form>
      </SlideOver>
      <span hidden>{tipo}</span>
    </div>
  );
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
function MediaPanel({ content }: { content: Contenido }) {
  const t = useTranslations("prestador.media");
  const tc = useTranslations("common");
  const q = useMultimediaM4(content.id);
  const actions = useMultimediaActions(content.id, content.version);
  const [error, setError] = useState<string>();
  const editable = ESTADOS_EDITABLES.includes(content.estado);

  const onUpload = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("archivo") as File | null;
    if (!file || !file.size) return setError(t("fileRequired"));
    if (!ACCEPT.includes(file.type)) return setError(t("badType"));
    const video = file.type === "video/mp4";
    if (file.size > (video ? 50 : 10) * 1_000_000) return setError(t("tooLarge", { max: video ? 50 : 10 }));
    setError(undefined);
    actions.upload.mutate({ archivo: file, tipo: video ? "video" : "foto", orden: (q.data?.length ?? 0) + 1 });
  };

  const move = (index: number, delta: number) => {
    const list = [...(q.data ?? [])];
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    actions.reorder.mutate(list.map((m, i) => ({ id: m.id, orden: i + 1 })));
  };

  return (
    <div className="max-w-3xl space-y-6">
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.data?.length === 0 && <StatusBlock kind="empty" title={t("none")} />}
      <ul role="list" className="divide-y divide-line rounded-md border border-line bg-card">
        {q.data?.map((m, i) => (
          <li key={m.id} className="flex flex-wrap items-center gap-4 py-3">
            {m.tipo === "foto" ? (
              // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
              <img src={m.url_cdn} alt="" className="h-14 w-24 object-cover" loading="lazy" />
            ) : (
              <span className="meta inline-flex h-14 w-24 items-center justify-center rounded bg-page">{t("video")}</span>
            )}
            <span className="flex-1">
              <span className="font-medium">{t("item", { n: m.orden })}</span>
              <span className="meta block text-ink/80">{m.mime_type} · {formatBytes(m.tam_bytes)}</span>
            </span>
            {editable && (
              <span className="flex gap-2">
                <Button variant="secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp", { n: m.orden })}>↑</Button>
                <Button variant="secondary" disabled={i === (q.data?.length ?? 0) - 1} onClick={() => move(i, 1)} aria-label={t("moveDown", { n: m.orden })}>↓</Button>
                <Button variant="danger" onClick={() => actions.remove.mutate(m.id)} aria-label={t("remove", { n: m.orden })}>{tc("delete")}</Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form onSubmit={onUpload} noValidate className="card p-5 sm:p-6 space-y-3">
          <h2 className="!text-xl">{t("upload")}</h2>
          <TextField label={t("file")} name="archivo" type="file" accept={ACCEPT.join(",")} hint={t("limits")} error={error} />
          <Button type="submit" loading={actions.upload.isPending}>{t("uploadButton")}</Button>
          {actions.upload.isError && <ErrorNotice error={actions.upload.error} referenceLabel={tc("reference")} />}
        </form>
      )}
    </div>
  );
}

function SlotsPanel({ content }: { content: Contenido }) {
  const t = useTranslations("prestador.slots");
  const tc = useTranslations("common");
  const locale = useLocale();
  const q = useFranjasM4(content.id);
  const actions = useFranjaActions(content.id);
  const [panel, setPanel] = useState<{ mode: "new" } | { mode: "edit"; slot: FranjaM4 } | null>(null);
  const [error, setError] = useState<string>();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const total = Number(f.get("cupo_total"));
    const disp = Number(f.get("cupo_disponible") ?? total);
    if (!(total >= 1) || disp < 0 || disp > total) return setError(t("quotaError"));
    setError(undefined);
    const done = { onSuccess: () => setPanel(null), onError: (err: unknown) => err instanceof ApiError && setError(err.message) };
    if (panel?.mode === "edit") actions.update.mutate({ id: panel.slot.id, version: panel.slot.version, cupo_total: total, cupo_disponible: disp, estado: String(f.get("estado")) }, done);
    else actions.create.mutate({ fecha: String(f.get("fecha")), hora_inicio: String(f.get("hora_inicio")), hora_fin: String(f.get("hora_fin")), cupo_total: total, cupo_disponible: total, estado: "disponible" }, done);
  };
  const slot = panel?.mode === "edit" ? panel.slot : undefined;

  return (
    <div>
      <div className="mb-4 flex justify-end"><Button onClick={() => setPanel({ mode: "new" })}>{t("new")}</Button></div>
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.data && (
        <EditorialTable
          caption={t("title")}
          rows={q.data}
          rowKey={(r) => r.id}
          empty={t("none")}
          columns={[
            { key: "f", header: t("date"), cell: (r) => formatDate(r.fecha, locale) },
            { key: "h", header: t("time"), cell: (r) => <span className="tabular">{r.hora_inicio} – {r.hora_fin}</span> },
            { key: "c", header: t("quota"), align: "right", cell: (r) => `${r.cupo_disponible} / ${r.cupo_total}` },
            { key: "e", header: tc("status"), cell: (r) => r.estado },
            {
              key: "a",
              header: <span className="sr-only">{tc("actions")}</span>,
              cell: (r) => (
                <span className="flex gap-3">
                  <button type="button" className="text-link font-semibold" onClick={() => setPanel({ mode: "edit", slot: r })}>{tc("edit")}</button>
                  <button type="button" className="text-link font-semibold text-critical" onClick={() => actions.remove.mutate(r.id)}>{tc("delete")}</button>
                </span>
              ),
            },
          ]}
        />
      )}
      <SlideOver open={panel !== null} onClose={() => { setPanel(null); setError(undefined); }} title={slot ? t("edit") : t("new")}>
        <form key={slot?.id ?? "new"} onSubmit={onSubmit} noValidate className="space-y-5">
          {!slot && (
            <>
              <TextField label={t("date")} name="fecha" type="date" required />
              <div className="grid grid-cols-2 gap-4">
                <TextField label={t("start")} name="hora_inicio" type="time" required />
                <TextField label={t("end")} name="hora_fin" type="time" required />
              </div>
            </>
          )}
          <TextField label={t("totalQuota")} name="cupo_total" type="number" min={1} defaultValue={slot?.cupo_total} required />
          {slot && (
            <>
              <TextField label={t("availableQuota")} name="cupo_disponible" type="number" min={0} defaultValue={slot.cupo_disponible} required />
              <SelectField label={tc("status")} name="estado" defaultValue={slot.estado}>
                <option value="disponible">{t("states.disponible")}</option>
                <option value="agotado">{t("states.agotado")}</option>
                <option value="cerrado">{t("states.cerrado")}</option>
              </SelectField>
            </>
          )}
          {error && <p role="alert" className="font-medium text-critical">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" loading={actions.create.isPending || actions.update.isPending}>{tc("save")}</Button>
            <Button variant="secondary" onClick={() => setPanel(null)}>{tc("cancel")}</Button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}

export function OfferEditorView({ tipo, id }: { tipo: Tipo; id?: string }) {
  const t = useTranslations("prestador.editor");
  const tc = useTranslations("common");
  const tt = useTranslations("prestador.offer.types");
  const q = useContenido(tipo, id);
  useDocumentTitle(id ? t("editTitle") : t("newTitle"));

  return (
    <RequireRole area="prestador">
      <PageHeader title={id ? t("editTitle") : t("newTitle")} eyebrow={<Link href="/mi-oferta" className="text-link">← {tt(tipo)}</Link>} />
      <Container className="py-8">
        {id && q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {id && q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
        {(!id || q.data) && (
          <Tabs
            label={t("title")}
            tabs={[
              { id: "contenido", label: t("tabs.content"), content: <ContentForm key={q.data?.id ?? "new"} tipo={tipo} content={q.data} /> },
              ...(q.data
                ? [
                    { id: "editorial", label: t("tabs.editorial"), content: <EditorialPanel tipo={tipo} content={q.data} /> },
                    { id: "multimedia", label: t("tabs.media"), content: <MediaPanel content={q.data} /> },
                    { id: "franjas", label: t("tabs.slots"), content: <SlotsPanel content={q.data} /> },
                  ]
                : []),
            ]}
          />
        )}
      </Container>
    </RequireRole>
  );
}
