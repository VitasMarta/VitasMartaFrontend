"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import { toList, type PageResponse, type UsuarioAdmin } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import type { Rol } from "@/core/auth/rbacGuard";
import { formatDateTime, localized } from "@/core/format";
import { Link, usePathname } from "@/core/i18n/navigation";
import { useUiStore } from "@/core/store/uiStore";
import { EstadoTag } from "@/features/prestador/OfferViews";
import { PAGE_SIZE, useOferta } from "@/features/prestador/api";
import { TIPOS, type Contenido, type Tipo } from "@/features/prestador/offer";
import { cn } from "@/shared/ui/cn";
import { useDocumentTitle } from "@/shared/hooks";
import { Button, actionButtonClass } from "@/shared/ui/Button";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { EditorialList, EditorialRow } from "@/shared/ui/EditorialRow";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/shared/ui/forms";
import { StatusTag } from "@/shared/ui/indicators";
import { Container, DefinitionRows, PageHeader } from "@/shared/ui/layout";
import { Pagination } from "@/shared/ui/Pagination";
import { SlideOver } from "@/shared/ui/SlideOver";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { Tabs } from "@/shared/ui/Tabs";
import { GuiaApiIntegracion } from "./GuiaApiIntegracion";
import { ACCIONES_POR_ESTADO, VistaPreviaContenido } from "./VistaPreviaContenido";

const ROLES: Rol[] = ["TURISTA", "PRESTADOR", "ANALISTA_TURISTICO", "AUTORIDAD_AMBIENTAL", "INTEGRADOR_TECNICO", "ADMINISTRADOR"];
const SIZE = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADO_TONO: Record<string, "good" | "warn" | "bad" | "neutral"> = { ACTIVA: "good", PENDIENTE_VERIFICACION: "warn", BLOQUEADA: "bad", SEUDONIMIZADA: "neutral" };
const toast = (tone: "success" | "error", message: string, reference?: string) => useUiStore.getState().push({ tone, message, reference });

/** Sub-navegación de la sección de administración (enlace con aria-current). */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const items = ["usuarios", "matriz", "auditoria", "prestadores", "moderacion", "tipos", "credenciales", "ambiental"] as const;
  return (
    <RequireRole area="admin">
      <nav aria-label={t("label")} className="border-b border-line bg-card">
        <ul role="list" className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {items.map((i) => {
            const active = pathname === `/admin/${i}` || pathname.startsWith(`/admin/${i}/`);
            return (
              <li key={i}>
                <Link href={`/admin/${i}`} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold", active ? "border-action bg-action text-on-action" : "border-line text-ink hover:border-action hover:text-action")}>
                  {t(i)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </RequireRole>
  );
}

export function AdminHomeView() {
  const t = useTranslations("admin.home");
  useDocumentTitle(t("title"));
  const items = ["usuarios", "matriz", "auditoria", "prestadores", "moderacion", "tipos", "credenciales", "ambiental"] as const;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EditorialList label={t("title")}>
          {items.map((i, n) => (
            <EditorialRow key={i} index={n + 1} title={t(`sections.${i}.title`)} summary={t(`sections.${i}.desc`)} href={`/admin/${i}`} actionLabel={t("open")} />
          ))}
        </EditorialList>
      </div>
    </>
  );
}

// ── Usuarios (M7) ───────────────────────────────────────────────────────────────────────────────
export function UsersView() {
  const t = useTranslations("admin.users");
  const tc = useTranslations("common");
  const tr = useTranslations("admin.roles");
  const locale = useLocale();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ correo: "", rol: "" });
  const [panel, setPanel] = useState<{ user: UsuarioAdmin; action: "rol" | "delete" } | null>(null);
  const [nuevoRol, setNuevoRol] = useState("");
  const [rolErrors, setRolErrors] = useState<Record<string, string>>({});
  useDocumentTitle(t("title"));

  // M7: ?correo=&rol=&estado=&page=&size= (page base 0).
  const q = useQuery({
    queryKey: ["m7", "usuarios", page, filters],
    queryFn: async () =>
      (await api.get<PageResponse<UsuarioAdmin>>(routes.identidad.admin.usuarios, { query: { page, size: SIZE, correo: filters.correo || undefined, rol: filters.rol || undefined } })).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["m7", "usuarios"] });
  // M7 `CambiarRolRequest`: { rol_nuevo, prestador_ref } — PRESTADOR exige el tenant aprobado en M4.
  const changeRole = useMutation({
    mutationFn: async ({ id, rol, prestadorRef }: { id: string; rol: string; prestadorRef?: string }) =>
      (await api.patch<{ mensaje?: string }>(routes.identidad.admin.rol(id), { body: { rol_nuevo: rol, ...(rol === "PRESTADOR" ? { prestador_ref: prestadorRef } : {}) } })).data,
    onSuccess: (d) => { toast("success", d.mensaje ?? t("roleUpdated")); setPanel(null); refresh(); },
  });
  const openRole = (user: UsuarioAdmin) => { setNuevoRol(user.rol); setRolErrors({}); setPanel({ user, action: "rol" }); };
  const unlock = useMutation({ mutationFn: async (id: string) => api.post(routes.identidad.admin.desbloqueo(id)), onSuccess: () => { toast("success", t("unlocked")); refresh(); } });
  const remove = useMutation({ mutationFn: async (id: string) => api.delete(routes.identidad.admin.usuario(id)), onSuccess: () => { toast("success", t("deleted")); setPanel(null); refresh(); } });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-6">
        <form className="mb-6 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setFilters({ correo: String(f.get("correo") ?? "").trim(), rol: String(f.get("rol") ?? "") }); setPage(0); }}>
          <TextField label={t("search")} name="correo" defaultValue={filters.correo} />
          <SelectField label={t("role")} name="rol" defaultValue={filters.rol}>
            <option value="">{t("allRoles")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
          </SelectField>
          <Button type="submit">{tc("search")}</Button>
        </form>
        {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
        {q.data && (
          <>
            <EditorialTable
              caption={t("title")}
              rows={q.data.content}
              rowKey={(u) => u.usuario_ref}
              empty={t("empty")}
              columns={[
                { key: "c", header: t("email"), cell: (u) => <span className="font-semibold">{u.correo}</span> },
                { key: "r", header: t("role"), cell: (u) => (tr.has(u.rol) ? tr(u.rol) : u.rol) },
                { key: "e", header: tc("status"), cell: (u) => <StatusTag tone={ESTADO_TONO[u.estado] ?? "neutral"}>{t.has(`states.${u.estado}`) ? t(`states.${u.estado}`) : u.estado}</StatusTag> },
                { key: "u", header: t("registered"), cell: (u) => formatDateTime(u.fecha_registro, locale) },
                {
                  key: "a",
                  header: <span className="sr-only">{tc("actions")}</span>,
                  cell: (u) => (
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <button type="button" className={actionButtonClass()} onClick={() => openRole(u)}>{t("changeRole")}<span className="sr-only"> {u.correo}</span></button>
                      {u.estado === "BLOQUEADA" && <button type="button" className={actionButtonClass()} onClick={() => unlock.mutate(u.usuario_ref)}>{t("unlock")}<span className="sr-only"> {u.correo}</span></button>}
                      <button type="button" className={actionButtonClass("danger")} onClick={() => setPanel({ user: u, action: "delete" })}>{tc("delete")}<span className="sr-only"> {u.correo}</span></button>
                    </span>
                  ),
                },
              ]}
            />
            <Pagination page={page} pageSize={SIZE} total={q.data.totalElements ?? q.data.total_elements ?? q.data.content.length} onChange={setPage} />
          </>
        )}
      </Container>
      <SlideOver open={panel !== null} onClose={() => setPanel(null)} title={panel?.action === "delete" ? t("deleteTitle") : t("changeRole")}>
        {panel?.action === "rol" && (
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const prestadorRef = String(new FormData(e.currentTarget).get("prestador_ref") ?? "").trim();
              if (nuevoRol === "PRESTADOR" && !UUID_RE.test(prestadorRef)) {
                setRolErrors({ prestador_ref: t("providerRefError") });
                return;
              }
              setRolErrors({});
              changeRole.mutate({ id: panel.user.usuario_ref, rol: nuevoRol, prestadorRef });
            }}
          >
            <p className="font-semibold">{panel.user.correo}</p>
            <SelectField label={t("newRole")} name="nuevo_rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</SelectField>
            {nuevoRol === "PRESTADOR" && (
              <TextField label={t("providerRef")} name="prestador_ref" defaultValue={panel.user.prestador_ref ?? ""} required hint={t("providerRefHint")} error={rolErrors.prestador_ref} />
            )}
            {changeRole.isError && <ErrorNotice error={changeRole.error} referenceLabel={tc("reference")} />}
            <p className="text-sm">{t("auditNotice")}</p>
            <div className="flex gap-3"><Button type="submit" loading={changeRole.isPending}>{tc("save")}</Button><Button variant="secondary" onClick={() => setPanel(null)}>{tc("cancel")}</Button></div>
          </form>
        )}
        {panel?.action === "delete" && (
          <div className="space-y-5">
            <p className="font-semibold">{panel.user.correo}</p>
            <p>{t("deleteWarning")}</p>
            <div className="flex gap-3"><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(panel.user.usuario_ref)}>{tc("delete")}</Button><Button variant="secondary" onClick={() => setPanel(null)}>{tc("cancel")}</Button></div>
          </div>
        )}
      </SlideOver>
    </>
  );
}

// ── Matriz de autorización (RBAC) ───────────────────────────────────────────────────────────────
/** M7 `PermisoMatrizResponse` / `PermisoMatrizRequest`: un permiso por (rol, recurso, acción). */
interface PermisoMatriz { rol: string; recurso: string; accion: string; permitir: boolean }
/** M7 `MatrizResponse`: `{ vigente: { version, fecha_publicacion, responsable, permisos }, historial }`. */
interface MatrizM7 { vigente: { version: number; fecha_publicacion?: string; responsable?: string; permisos: PermisoMatriz[] } | null; historial?: unknown[] }
export function MatrixView() {
  const t = useTranslations("admin.matrix");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  useDocumentTitle(t("title"));
  const q = useQuery({
    queryKey: ["m7", "matriz"],
    queryFn: async () => {
      const v = (await api.get<MatrizM7>(routes.identidad.admin.matriz)).data.vigente;
      return { version: v?.version ?? 0, permisos: v?.permisos ?? [] };
    },
  });
  const save = useMutation({
    mutationFn: async (permisos: PermisoMatriz[]) => (await api.put<{ mensaje?: string; version: number }>(routes.identidad.admin.matriz, { body: { permisos } })).data,
    onSuccess: (d) => { toast("success", t("saved", { version: d.version })); qc.invalidateQueries({ queryKey: ["m7", "matriz"] }); },
  });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const permisos = JSON.parse(String(new FormData(e.currentTarget).get("permisos")));
      if (!Array.isArray(permisos) || !permisos.length || permisos.some((p) => !p.rol || !p.recurso || !p.accion || typeof p.permitir !== "boolean")) throw new Error();
      setError(undefined);
      save.mutate(permisos);
    } catch {
      setError(t("invalidJson"));
    }
  };
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="grid gap-10 py-8 lg:grid-cols-2">
        <div>
          {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
          {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
          {q.data && (
            <>
              <p className="meta mb-2">{t("version", { version: q.data.version })}</p>
              <EditorialTable caption={t("title")} rows={q.data.permisos} rowKey={(p) => `${p.rol}-${p.recurso}-${p.accion}`} columns={[
                { key: "r", header: t("role"), cell: (p) => <strong>{p.rol}</strong> },
                { key: "x", header: t("resource"), cell: (p) => p.recurso },
                { key: "a", header: t("actions"), cell: (p) => `${p.accion}${p.permitir ? "" : " ✕"}` },
              ]} />
            </>
          )}
        </div>
        {q.data && (
          <form key={q.data.version} onSubmit={onSubmit} noValidate className="space-y-4">
            <TextAreaField label={t("editor")} name="permisos" rows={14} defaultValue={JSON.stringify(q.data.permisos, null, 2)} hint={t("editorHint")} error={error} className="font-mono" />
            <Button type="submit" loading={save.isPending}>{t("publish")}</Button>
          </form>
        )}
      </Container>
    </>
  );
}

// ── Auditoría (M7 · M4 · outbox) ────────────────────────────────────────────────────────────────
function M7Audit() {
  const t = useTranslations("admin.audit");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [page, setPage] = useState(0);
  const [f, setF] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["m7", "auditoria", page, f], queryFn: async () => (await api.get<PageResponse<Record<string, string>>>(routes.identidad.admin.auditoria, { query: { page, size: SIZE, ...f } })).data });
  return (
    <div>
      <form className="mb-6 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); setF(Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v).map(([k, v]) => [k, String(v)]))); setPage(0); }}>
        <TextField label={t("user")} name="usuario" /><TextField label={t("resource")} name="recurso" /><TextField label={t("action")} name="accion" />
        <TextField label={t("from")} name="desde" type="date" /><TextField label={t("to")} name="hasta" type="date" />
        <Button type="submit">{tc("search")}</Button>
      </form>
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && (
        <>
          <EditorialTable caption={t("m7")} rows={q.data.content} rowKey={(r) => r.correlation_id} empty={t("empty")} columns={[
            { key: "t", header: t("timestamp"), cell: (r) => formatDateTime(r.marca_temporal, locale) },
            { key: "u", header: t("user"), cell: (r) => r.usuario },
            { key: "r", header: t("role"), cell: (r) => r.rol },
            { key: "a", header: t("action"), cell: (r) => r.accion },
            { key: "x", header: t("resource"), cell: (r) => r.recurso },
            { key: "o", header: t("result"), cell: (r) => <StatusTag tone={r.resultado === "EXITO" ? "good" : "bad"}>{r.resultado}</StatusTag> },
            { key: "c", header: t("correlation"), cell: (r) => <span className="font-mono text-xs">{r.correlation_id}</span> },
          ]} />
          <Pagination page={page} pageSize={SIZE} total={q.data.totalElements ?? q.data.total_elements ?? 0} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function M4Audit() {
  const t = useTranslations("admin.audit");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["m4", "auditoria", page], queryFn: async () => toList<Record<string, string>>((await api.get(routes.prestadores.admin.auditoria, { query: { page, page_size: SIZE } })).data) });
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  return (
    <>
      <EditorialTable caption={t("m4")} rows={q.data.items} rowKey={(r) => `${r.fecha}-${r.recurso}`} empty={t("empty")} columns={[
        { key: "f", header: t("timestamp"), cell: (r) => formatDateTime(r.fecha, locale) }, { key: "u", header: t("user"), cell: (r) => r.actor },
        { key: "a", header: t("action"), cell: (r) => r.accion }, { key: "x", header: t("resource"), cell: (r) => r.recurso },
      ]} />
      <Pagination base={1} page={page} pageSize={SIZE} total={q.data.total} onChange={setPage} />
    </>
  );
}

function OutboxPanel() {
  const t = useTranslations("admin.audit");
  const tc = useTranslations("common");
  const tm = useTranslations("admin.moderation");
  const locale = useLocale();
  const qc = useQueryClient();
  // El outbox de M4 es por prestador (X-Tenant-Id obligatorio): se elige el prestador como en Moderación.
  const { q: providers, tenant, setTenant } = useTenantPicker();
  type EventoOutbox = { id: string; event_type: string; routing_key: string; estado: string; intentos: number; ocurrido_en: string; ultimo_error?: string | null };
  const q = useQuery({
    queryKey: ["m4", "outbox", tenant],
    enabled: !!tenant,
    queryFn: async () => toList<EventoOutbox>((await api.get(routes.prestadores.admin.outbox, { tenantId: tenant })).data),
  });
  const retry = useMutation({ mutationFn: async (id: string) => api.post(routes.prestadores.admin.outboxReintentar(id), { tenantId: tenant }), onSuccess: () => { toast("success", t("retried")); qc.invalidateQueries({ queryKey: ["m4", "outbox"] }); } });
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <SelectField label={tm("provider")} name="tenant" value={tenant} onChange={(e) => setTenant(e.target.value)}>
          {(providers.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
        </SelectField>
      </div>
      {(providers.isPending || (!!tenant && q.isPending)) && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && (
        <EditorialTable caption={t("outbox")} rows={q.data.items} rowKey={(r) => r.id} empty={t("empty")} columns={[
          { key: "e", header: t("event"), cell: (r) => <span><span className="font-semibold">{r.event_type}</span><span className="meta block text-ink/80">{r.routing_key}</span></span> },
          { key: "f", header: tc("date"), cell: (r) => formatDateTime(r.ocurrido_en, locale) },
          { key: "s", header: tc("status"), cell: (r) => <StatusTag tone={r.estado === "fallido" ? "bad" : r.estado === "publicado" ? "good" : "warn"}>{r.estado}</StatusTag> },
          { key: "i", header: t("attempts"), align: "right", cell: (r) => r.intentos },
          { key: "a", header: <span className="sr-only">{tc("actions")}</span>, cell: (r) => r.estado === "fallido" && <button type="button" className={actionButtonClass()} onClick={() => retry.mutate(r.id)}>{t("retry")}<span className="sr-only"> {r.event_type}</span></button> },
        ]} />
      )}
    </div>
  );
}

export function AuditView() {
  const t = useTranslations("admin.audit");
  useDocumentTitle(t("title"));
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8"><Tabs label={t("title")} tabs={[{ id: "m7", label: t("m7"), content: <M7Audit /> }, { id: "m4", label: t("m4"), content: <M4Audit /> }, { id: "outbox", label: t("outbox"), content: <OutboxPanel /> }]} /></Container>
    </>
  );
}

// ── Prestadores (M4 · admin) ────────────────────────────────────────────────────────────────────
interface PrestadorAdmin { id: string; razon_social: string; nombre_comercial?: string; tipo: string; estado: string; email?: string }
const ESTADO_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { aprobado: "good", pendiente: "warn", rechazado: "bad", suspendido: "bad" };
const PROVIDER_ACTIONS: Record<string, string[]> = { pendiente: ["aprobar", "rechazar"], aprobado: ["suspender"], suspendido: ["reactivar"], rechazado: [] };

export function usePrestadoresAdmin(estado?: string, texto?: string, page = 1, enabled = true) {
  return useQuery({
    queryKey: ["m4", "admin", "prestadores", estado, texto, page],
    enabled,
    queryFn: async () => toList<PrestadorAdmin>((await api.get(routes.prestadores.admin.prestadores, { query: { estado, texto, page, page_size: SIZE } })).data),
  });
}

/**
 * Aprobar un prestador en M4 no cambia el rol en M7: se asigna aquí mismo con la cuenta que hizo la
 * solicitud (`usuario_id` del detalle de M4) y el prestador como `prestador_ref` (CTR-M7 cambio de rol).
 */
async function asignarRolPrestador(prestadorId: string) {
  const detalle = (await api.get<{ usuario_id: string }>(routes.prestadores.admin.prestador(prestadorId))).data;
  await api.patch(routes.identidad.admin.rol(detalle.usuario_id), { body: { rol_nuevo: "PRESTADOR", prestador_ref: prestadorId } });
}

export function ProvidersView() {
  const t = useTranslations("admin.providers");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ estado: "", texto: "" });
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<PrestadorAdmin | null>(null);
  const [action, setAction] = useState<string>("");
  const [error, setError] = useState<string>();
  useDocumentTitle(t("title"));
  const q = usePrestadoresAdmin(filters.estado || undefined, filters.texto || undefined, page);
  const act = useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, accion, motivo }: { id: string; accion: string; motivo: string }) => {
      await api.post(routes.prestadores.admin.prestadorAccion(id, accion), { body: { motivo } });
      if (accion !== "aprobar") return { rol: null };
      // La aprobación ya quedó en M4: si el cambio de rol falla, se informa sin deshacerla.
      try {
        await asignarRolPrestador(id);
        return { rol: "ok" as const };
      } catch (e) {
        return { rol: e instanceof ApiError ? e : new Error(String(e)) };
      }
    },
    onSuccess: (r) => {
      if (r.rol instanceof Error) toast("error", t("roleFailed", { error: r.rol.message }), r.rol instanceof ApiError ? r.rol.correlationId : undefined);
      else toast("success", r.rol === "ok" ? t("approvedWithRole") : t("done"));
      setPanel(null); setAction(""); qc.invalidateQueries({ queryKey: ["m4", "admin", "prestadores"] }); qc.invalidateQueries({ queryKey: ["m7"] });
    },
    onError: (e) => e instanceof ApiError && setError(e.message),
  });
  // Prestadores aprobados antes de la automatización (o si falló la asignación): un clic.
  const rol = useMutation({
    meta: { silent: true },
    mutationFn: async (id: string) => asignarRolPrestador(id),
    onSuccess: () => { toast("success", t("roleAssigned")); setPanel(null); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (["rechazar", "suspender"].includes(action) && !motivo) return setError(t("reasonRequired"));
    setError(undefined);
    act.mutate({ id: panel!.id, accion: action, motivo });
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-6">
        <form className="mb-6 flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setFilters({ estado: String(f.get("estado")), texto: String(f.get("texto")) }); setPage(1); }}>
          <SelectField label={tc("status")} name="estado" defaultValue={filters.estado}>
            <option value="">{t("all")}</option>
            {["pendiente", "aprobado", "rechazado", "suspendido"].map((s) => <option key={s} value={s}>{t(`states.${s}`)}</option>)}
          </SelectField>
          <TextField label={t("search")} name="texto" defaultValue={filters.texto} />
          <Button type="submit">{tc("search")}</Button>
        </form>
        {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
        {q.data && (
          <>
            <EditorialTable caption={t("title")} rows={q.data.items} rowKey={(p) => p.id} empty={t("empty")} columns={[
              { key: "n", header: t("name"), cell: (p) => <span><strong>{p.razon_social}</strong><span className="meta block text-ink/80">{p.email}</span></span> },
              { key: "t", header: t("type"), cell: (p) => p.tipo },
              { key: "e", header: tc("status"), cell: (p) => <StatusTag tone={ESTADO_TONE[p.estado] ?? "neutral"}>{t(`states.${p.estado}`)}</StatusTag> },
              { key: "a", header: <span className="sr-only">{tc("actions")}</span>, cell: (p) => <button type="button" className={actionButtonClass()} onClick={() => { setPanel(p); setAction(PROVIDER_ACTIONS[p.estado]?.[0] ?? ""); setError(undefined); }}>{t("manage")}<span className="sr-only"> {p.razon_social}</span></button> },
            ]} />
            <Pagination base={1} page={page} pageSize={SIZE} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Container>
      <SlideOver open={panel !== null} onClose={() => setPanel(null)} title={panel?.razon_social ?? ""}>
        {panel && (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <DefinitionRows rows={[
              { term: t("type"), value: panel.tipo },
              { term: tc("status"), value: t(`states.${panel.estado}`) },
              ...(panel.email ? [{ term: t("email"), value: panel.email }] : []),
              // El administrador lo usa como `prestador_ref` al asignar el rol PRESTADOR en Usuarios (M7).
              { term: t("providerId"), value: <code className="break-all font-mono select-all" data-testid="prestador-id">{panel.id}</code> },
            ]} />
            {panel.estado === "aprobado" && (
              <div className="space-y-3 rounded-lg bg-page p-4">
                <p className="text-sm">{t("assignRoleHint")}</p>
                <Button type="button" variant="secondary" loading={rol.isPending} onClick={() => rol.mutate(panel.id)}>{t("assignRole")}</Button>
                {rol.isError && <p role="alert" className="text-sm font-medium text-critical">{error}</p>}
              </div>
            )}
            {(PROVIDER_ACTIONS[panel.estado] ?? []).length === 0 ? <p>{t("noActions")}</p> : (
              <>
                <SelectField label={t("action")} name="accion" value={action} onChange={(e) => setAction(e.target.value)}>
                  {PROVIDER_ACTIONS[panel.estado].map((a) => <option key={a} value={a}>{t(`actions.${a}`)}</option>)}
                </SelectField>
                <TextAreaField label={t("reason")} name="motivo" required={["rechazar", "suspender"].includes(action)} error={error} />
                <Button type="submit" variant={["rechazar", "suspender"].includes(action) ? "danger" : "primary"} loading={act.isPending}>{tc("confirm")}</Button>
              </>
            )}
          </form>
        )}
      </SlideOver>
    </>
  );
}

// ── Moderación editorial (M4 · admin con X-Tenant-Id) ───────────────────────────────────────────
function useTenantPicker() {
  const q = usePrestadoresAdmin("aprobado");
  const [tenant, setTenant] = useState("");
  return { q, tenant: tenant || q.data?.items[0]?.id || "", setTenant };
}

export function ModerationView() {
  const t = useTranslations("admin.moderation");
  const tEstados = useTranslations("prestador.states");
  const tc = useTranslations("common");
  const locale = useLocale();
  const qc = useQueryClient();
  const { q: providers, tenant, setTenant } = useTenantPicker();
  const [tipo, setTipo] = useState<Tipo>("atractivos");
  const [estado, setEstado] = useState("en_revision");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Contenido | null>(null);
  const [error, setError] = useState<string>();
  useDocumentTitle(t("title"));
  const list = useOferta(tipo, page, estado || undefined, tenant);
  const preview = useQuery({ queryKey: ["m4", "proyeccion", panel?.id, tenant], enabled: !!panel, queryFn: async () => (await api.get<Record<string, unknown>>(routes.prestadores.admin.contenidoProyeccion(panel!.id), { tenantId: tenant })).data });
  const act = useMutation({
    meta: { silent: true },
    mutationFn: async ({ accion, motivo }: { accion: string; motivo: string }) => (await api.post(routes.prestadores.admin.contenidoAccion(panel!.id, accion), { body: { motivo }, tenantId: tenant })).data,
    onSuccess: () => { toast("success", t("done")); setPanel(null); qc.invalidateQueries({ queryKey: ["m4"] }); },
    onError: (e) => e instanceof ApiError && setError(e.message),
  });
  const acciones = ACCIONES_POR_ESTADO[panel?.estado ?? ""] ?? [];
  const onAction = (accion: string, form: HTMLFormElement) => {
    const motivo = String(new FormData(form).get("motivo") ?? "").trim();
    if (["devolver", "rechazar"].includes(accion) && !motivo) return setError(t("reasonRequired"));
    setError(undefined);
    act.mutate({ accion, motivo });
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-6">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <SelectField label={t("provider")} name="tenant" value={tenant} onChange={(e) => { setTenant(e.target.value); setPage(1); }}>
            {providers.data?.items.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </SelectField>
          <SelectField label={t("type")} name="tipo" value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo); setPage(1); }}>
            {TIPOS.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}
          </SelectField>
          <SelectField label={tc("status")} name="estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
            <option value="">{t("all")}</option>
            {["en_revision", "aprobado", "publicado", "borrador", "archivado"].map((s) => <option key={s} value={s}>{tEstados.has(s) ? tEstados(s) : s}</option>)}
          </SelectField>
        </div>
        {(providers.isPending || list.isPending) && <StatusBlock kind="loading" title={tc("loading")} />}
        {list.isError && <ErrorNotice error={list.error} referenceLabel={tc("reference")} />}
        {list.data && (
          <>
            <EditorialTable caption={t("title")} rows={list.data.items} rowKey={(r) => r.id} empty={t("empty")} columns={[
              { key: "n", header: t("name"), cell: (r) => <span className="font-semibold">{localized(r.nombre, locale)}</span> },
              { key: "e", header: tc("status"), cell: (r) => <EstadoTag estado={r.estado} /> },
              { key: "v", header: t("version"), align: "right", cell: (r) => r.version },
              { key: "a", header: <span className="sr-only">{tc("actions")}</span>, cell: (r) => <button type="button" className={actionButtonClass()} onClick={() => { setPanel(r); setError(undefined); }}>{t("review")}<span className="sr-only"> {localized(r.nombre, locale)}</span></button> },
            ]} />
            <Pagination base={1} page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={setPage} />
          </>
        )}
      </Container>
      <SlideOver open={panel !== null} onClose={() => setPanel(null)} title={localized(panel?.nombre, locale)}>
        {panel && (
          <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-5">
            <p className="flex items-center gap-2"><span className="meta text-ink/70">{t("currentState")}</span><EstadoTag estado={panel.estado} /></p>
            <h3 className="!text-lg">{t("preview")}</h3>
            {preview.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
            {preview.isError && <ErrorNotice error={preview.error} referenceLabel={tc("reference")} />}
            {preview.data && <VistaPreviaContenido data={preview.data} />}
            {acciones.length === 0 ? (
              <p role="status" className="rounded-lg bg-page px-4 py-3 text-sm text-ink/80">{t("noActions")}</p>
            ) : (
              <div className="space-y-4 border-t border-line pt-5">
                {acciones.some((a) => ["devolver", "rechazar"].includes(a)) && (
                  <TextAreaField label={t("reason")} name="motivo" error={error} hint={t("reasonHint")} rows={3} />
                )}
                {error && !acciones.some((a) => ["devolver", "rechazar"].includes(a)) && <p role="alert" className="text-sm font-medium text-critical">{error}</p>}
                <div className="flex flex-wrap gap-3">
                  {acciones.map((a) => (
                    <Button key={a} variant={a === "rechazar" ? "danger" : ["aprobar", "publicar"].includes(a) ? "primary" : "secondary"} loading={act.isPending} onClick={(e) => onAction(a, (e.currentTarget as HTMLButtonElement).form!)}>{t(`actions.${a}`)}</Button>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </SlideOver>
    </>
  );
}

// ── Tipos de prestador (JSON Schema) ────────────────────────────────────────────────────────────
/** M4 `TipoPrestadorRespuesta`: el `codigo` es el identificador (no hay id ni versión). */
interface TipoPrestador { codigo: string; nombre: string; atributos_schema: Record<string, unknown>; activo: boolean }
export function ProviderTypesView() {
  const t = useTranslations("admin.types");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [panel, setPanel] = useState<TipoPrestador | "new" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useDocumentTitle(t("title"));
  const edit = panel && panel !== "new" ? panel : null;
  const q = useQuery({ queryKey: ["m4", "tipos"], queryFn: async () => toList<TipoPrestador>((await api.get(routes.prestadores.admin.tipos)).data).items });
  const save = useMutation({
    meta: { silent: true },
    // M4: crear = POST /tipos-prestador?codigo=… ; editar = PATCH /tipos-prestador/{codigo}. Cuerpo
    // `TipoPrestadorEntrada` { nombre, atributos_schema, activo } (extra=forbid: sin codigo ni versión).
    mutationFn: async (v: { codigo: string; existente: boolean; body: { nombre: string; atributos_schema: Record<string, unknown>; activo: boolean } }) =>
      v.existente
        ? (await api.patch(routes.prestadores.admin.tipo(v.codigo), { body: v.body })).data
        : (await api.post(routes.prestadores.admin.tipos, { query: { codigo: v.codigo }, body: v.body })).data,
    onSuccess: () => { toast("success", t("saved")); setPanel(null); qc.invalidateQueries({ queryKey: ["m4", "tipos"] }); },
    onError: (e) => e instanceof ApiError && setErrors({ form: e.isVersionConflict ? t("conflict") : e.message }),
  });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next: Record<string, string> = {};
    let schema: Record<string, unknown> = {};
    const codigo = edit?.codigo ?? String(f.get("codigo") ?? "").trim();
    if (!codigo) next.codigo = t("required");
    else if (!/^[a-z][a-z0-9_]{0,39}$/.test(codigo)) next.codigo = t("codeFormat");
    if (!String(f.get("nombre")).trim()) next.nombre = t("required");
    try { schema = JSON.parse(String(f.get("schema") || "{}")); } catch { next.schema = t("invalidJson"); }
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ codigo, existente: !!edit, body: { nombre: String(f.get("nombre")).trim(), atributos_schema: schema, activo: f.get("activo") === "on" } });
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<Button onClick={() => { setPanel("new"); setErrors({}); }}>{t("new")}</Button>} />
      <Container className="py-8">
        {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
        {q.data && (
          <EditorialTable caption={t("title")} rows={q.data} rowKey={(r) => r.codigo} empty={t("empty")} columns={[
            { key: "c", header: t("code"), cell: (r) => <span className="font-mono">{r.codigo}</span> }, { key: "n", header: t("name"), cell: (r) => <strong>{r.nombre}</strong> },
            { key: "p", header: t("properties"), cell: (r) => Object.keys((r.atributos_schema.properties as object) ?? {}).join(", ") || "—" },
            { key: "v", header: tc("status"), cell: (r) => <StatusTag tone={r.activo ? "good" : "neutral"}>{r.activo ? t("active") : t("inactive")}</StatusTag> },
            { key: "a", header: <span className="sr-only">{tc("actions")}</span>, cell: (r) => <button type="button" className={actionButtonClass()} onClick={() => { setPanel(r); setErrors({}); }}>{tc("edit")}<span className="sr-only"> {r.nombre}</span></button> },
          ]} />
        )}
      </Container>
      <SlideOver open={panel !== null} onClose={() => setPanel(null)} title={edit ? t("edit") : t("new")}>
        <form key={edit?.codigo ?? "new"} onSubmit={onSubmit} noValidate className="space-y-5">
          <TextField label={t("code")} name="codigo" defaultValue={edit?.codigo} required disabled={!!edit} hint={t("codeHint")} error={errors.codigo} />
          <TextField label={t("name")} name="nombre" defaultValue={edit?.nombre} required error={errors.nombre} />
          <TextAreaField label={t("schema")} name="schema" rows={10} defaultValue={edit ? JSON.stringify(edit.atributos_schema, null, 2) : "{\n  \"type\": \"object\",\n  \"properties\": {}\n}"} hint={t("schemaHint")} error={errors.schema} className="font-mono" />
          <CheckboxField label={t("active")} name="activo" defaultChecked={edit?.activo ?? true} />
          {errors.form && <p role="alert" className="font-medium text-critical">{errors.form}</p>}
          <div className="flex gap-3"><Button type="submit" loading={save.isPending}>{tc("save")}</Button><Button variant="secondary" onClick={() => setPanel(null)}>{tc("cancel")}</Button></div>
        </form>
      </SlideOver>
    </>
  );
}

// ── Credenciales de integración (API keys por tenant) ───────────────────────────────────────────
/** M4 `CredencialRespuesta` (la `clave` solo viene una vez, al crear). */
interface Credencial { id: string; tenant_id: string; nombre: string; prefijo: string; scopes: string[]; activo: boolean; created_at: string; revoked_at?: string | null }
const SCOPES_CREDENCIAL = ["disponibilidad:escribir", "disponibilidad:leer"] as const;
export function CredentialsView() {
  const t = useTranslations("admin.credentials");
  const tc = useTranslations("common");
  const locale = useLocale();
  const qc = useQueryClient();
  const { q: providers, tenant, setTenant } = useTenantPicker();
  const [secret, setSecret] = useState<string | null>(null);
  useDocumentTitle(t("title"));
  const list = useQuery({ queryKey: ["m4", "credenciales", tenant], enabled: !!tenant, queryFn: async () => toList<Credencial>((await api.get(routes.prestadores.admin.credenciales, { tenantId: tenant })).data).items.filter((c) => c.tenant_id === tenant) });
  // M4 (`CredencialCreacion`): { nombre, scopes[] } con scopes recurso:leer|escribir; revocar = POST …/revocar.
  const [nombre, setNombre] = useState("");
  const [scopes, setScopes] = useState<string[]>(["disponibilidad:escribir"]);
  const emit = useMutation({
    meta: { silent: true },
    mutationFn: async () => (await api.post<{ clave: string }>(routes.prestadores.admin.credenciales, { tenantId: tenant, body: { nombre: nombre.trim(), scopes } })).data,
    onSuccess: (d) => { setSecret(d.clave); setNombre(""); qc.invalidateQueries({ queryKey: ["m4", "credenciales"] }); },
  });
  const revoke = useMutation({ mutationFn: async (id: string) => api.post(`${routes.prestadores.admin.credencial(id)}/revocar`, { tenantId: tenant }), onSuccess: () => { toast("success", t("revoked")); qc.invalidateQueries({ queryKey: ["m4", "credenciales"] }); } });
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <SelectField label={t("provider")} name="tenant" value={tenant} onChange={(e) => { setTenant(e.target.value); setSecret(null); }}>
            {providers.data?.items.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </SelectField>
          <TextField label={t("name")} name="nombre_credencial" value={nombre} onChange={(e) => setNombre(e.target.value)} hint={t("nameHint")} />
          <fieldset className="flex flex-wrap gap-x-6">
            <legend className="mb-1 text-sm font-semibold">{t("scopes")}</legend>
            {SCOPES_CREDENCIAL.map((sc) => (
              <CheckboxField key={sc} label={t(`scopeNames.${sc.replace(":", "_")}`)} name={`scope_${sc.replace(":", "_")}`} checked={scopes.includes(sc)} onChange={(e) => setScopes((v) => (e.target.checked ? [...v, sc] : v.filter((x) => x !== sc)))} />
            ))}
          </fieldset>
          <Button onClick={() => emit.mutate()} loading={emit.isPending} disabled={!tenant || !nombre.trim() || scopes.length === 0}>{t("emit")}</Button>
        </div>
        {emit.isError && <div className="mb-6"><ErrorNotice error={emit.error} referenceLabel={tc("reference")} /></div>}
        {secret && (
          <div role="alert" className="mb-6 rounded-md border border-l-4 border-emerald bg-card px-4 py-4">
            <p className="font-semibold">{t("copyNow")}</p>
            <p className="mt-2 break-all font-mono text-lg">{secret}</p>
            <Button className="mt-3" variant="secondary" onClick={() => navigator.clipboard?.writeText(secret).then(() => toast("success", t("copied")))}>{t("copy")}</Button>
          </div>
        )}
        {list.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {list.data && (
          <EditorialTable caption={t("title")} rows={list.data} rowKey={(r) => r.id} empty={t("empty")} columns={[
            { key: "n", header: t("name"), cell: (r) => <span><strong>{r.nombre}</strong><span className="meta block font-mono text-ink/80">{r.prefijo}… · {r.scopes.join(", ")}</span></span> },
            { key: "c", header: t("created"), cell: (r) => formatDateTime(r.created_at, locale) },
            { key: "e", header: tc("status"), cell: (r) => <StatusTag tone={r.activo ? "good" : "bad"}>{t(`states.${r.activo ? "activa" : "revocada"}`)}</StatusTag> },
            { key: "a", header: <span className="sr-only">{tc("actions")}</span>, cell: (r) => r.activo && <button type="button" className={actionButtonClass("danger")} onClick={() => revoke.mutate(r.id)}>{t("revoke")}<span className="sr-only"> {r.prefijo}</span></button> },
          ]} />
        )}
        <GuiaApiIntegracion />
      </Container>
    </>
  );
}
