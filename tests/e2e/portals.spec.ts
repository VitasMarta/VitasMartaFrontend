import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Passw0rd!Passw0rd";

async function noA11yViolations(page: Page) {
  // IDs únicos: un <label for> con id repetido apuntaría al control equivocado (WCAG 4.1.1)
  const duplicates = await page.evaluate(() => { const seen = new Map<string, number>(); document.querySelectorAll("[id]").forEach((el) => seen.set(el.id, (seen.get(el.id) ?? 0) + 1)); return [...seen].filter(([, n]) => n > 1).map(([id]) => id); });
  expect(duplicates).toEqual([]);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function login(page: Page, correo: string, totp?: string) {
  await page.goto("/es-CO/login");
  await page.getByLabel("Correo electrónico").fill(correo);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  if (totp) {
    await page.getByLabel("Código de verificación").fill(totp);
    await page.getByRole("button", { name: "Verificar" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
}

test("páginas públicas de autenticación: registro con consentimientos granulares y sin violaciones axe", async ({ page }) => {
  await page.goto("/es-CO/registro");
  await expect(page.getByRole("heading", { level: 1, name: "Crear cuenta" })).toBeVisible();
  await noA11yViolations(page);
  // Contraseña débil + sin tratamiento de datos → resumen de errores
  await page.getByLabel("Correo electrónico").fill("nueva@correo.co");
  await page.getByLabel(/^Contraseña/).fill("corta");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Revisa los campos marcados" })).toBeVisible();
  // Consentimientos COMERCIAL y PERFILADO son independientes y opcionales
  await expect(page.getByLabel(/comunicaciones comerciales/)).not.toBeChecked();
  await expect(page.getByLabel(/perfilado con inteligencia artificial/)).not.toBeChecked();

  await page.goto("/es-CO/recuperar");
  await page.getByLabel("Correo electrónico").fill("cualquiera@correo.co");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText("Si el correo está registrado, recibirás un enlace de recuperación")).toBeVisible();
});

test("turista: mi perfil — apagar el perfilado de IA actualiza M7 y M6 responde sin personalización", async ({ page }) => {
  await login(page, "turista@vitasmarta.co");
  await page.goto("/es-CO");
  await expect(page.getByText("Sugerencias generadas por Inteligencia Artificial para tu viaje")).toBeVisible();

  await page.goto("/es-CO/mi-perfil?seccion=consentimientos");
  await page.getByRole("tab", { name: "Consentimientos" }).click();
  await page.getByRole("switch", { name: "Permitir recomendaciones personalizadas con IA" }).uncheck();
  await expect(page.getByText(/Desactivaste/)).toBeVisible();
  await noA11yViolations(page);

  await page.goto("/es-CO");
  await expect(page.getByText("Sugerencias destacadas de Santa Marta")).toBeVisible(); // ESTANDAR_SIN_PERFILADO
  await page.getByRole("link", { name: "Mis reservas" }).click();
  await expect(page.getByRole("tab", { name: "Activas" })).toBeVisible();
  await noA11yViolations(page);
});

test("prestador: oferta, edición, conflicto de versión sin perder el texto, y reservas recibidas", async ({ browser }) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  await login(a, "prestador@vitasmarta.co");
  await a.goto("/es-CO/mi-oferta");
  await expect(a.getByRole("table", { name: "Atractivos" })).toBeVisible();
  await noA11yViolations(a);

  // Dos pestañas editan el mismo borrador (atr-003 de M4)
  await a.getByRole("link", { name: /Editar Bahía Escondida/ }).click();
  await expect(a.getByRole("heading", { level: 1, name: "Editar contenido" })).toBeVisible();
  const url = a.url();
  const b = await context.newPage();
  await b.goto(url);
  await expect(b.getByLabel("Nombre (español)")).toHaveValue("Bahía Escondida");
  await b.getByLabel("Nombre (español)").fill("Bahía Escondida B");
  await b.getByRole("button", { name: "Guardar" }).click();
  await expect(b.getByText("Contenido guardado")).toBeVisible();

  await a.getByLabel("Descripción (español)").fill("Mi texto largo que NO debe perderse");
  await a.getByRole("button", { name: "Guardar" }).click();
  await expect(a.getByRole("alert").filter({ hasText: "Alguien más modificó este contenido" })).toBeVisible();
  await expect(a.getByLabel("Descripción (español)")).toHaveValue("Mi texto largo que NO debe perderse");
  await a.getByRole("button", { name: "Recargar datos más recientes" }).click();
  await expect(a.getByText(/Tu texto se conservó/)).toBeVisible();
  await expect(a.getByLabel("Descripción (español)")).toHaveValue("Mi texto largo que NO debe perderse");
  await a.getByRole("button", { name: "Guardar" }).click();
  await expect(a.getByText("Contenido guardado")).toBeVisible();

  // Reservas recibidas: confirmar con panel deslizante e Idempotency-Key
  await a.goto("/es-CO/reservas-recibidas");
  await expect(a.getByRole("table", { name: "Reservas recibidas" })).toBeVisible();
  await a.getByRole("button", { name: /^Confirmar 00000000/ }).first().click();
  const dialog = a.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(a.getByText("Reserva confirmada")).toBeVisible();
  await noA11yViolations(a);

  // Check-in QR
  await a.goto("/es-CO/checkin-qr");
  await a.getByLabel("Código QR").fill("00000000-0000-4000-9000-000000000002"); // reserva confirmada del mock (id real de M3)
  await a.getByRole("button", { name: "Validar" }).click();
  await expect(a.getByText(/Reserva válida/)).toBeVisible();
  await context.close();
});

test("admin con MFA: usuarios, cambio de rol, moderación, y un turista no accede", async ({ page }) => {
  await login(page, "admin@vitasmarta.co", "123456");
  await page.goto("/es-CO/admin/usuarios");
  await expect(page.getByRole("table", { name: "Usuarios" })).toBeVisible();
  await noA11yViolations(page);
  await page.getByRole("button", { name: /^Cambiar rol usuario1@correo.co/ }).click();
  const dialog = page.getByRole("dialog", { name: "Cambiar rol" });
  await dialog.getByLabel("Nuevo rol").selectOption("ANALISTA_TURISTICO");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/registrado en auditoría/).first()).toBeVisible();

  await page.goto("/es-CO/admin/moderacion");
  await expect(page.getByRole("table", { name: "Moderación editorial" })).toBeVisible();
  await noA11yViolations(page);
  await page.goto("/es-CO/admin/ambiental");
  await expect(page.getByRole("tab", { name: "Capacidad" })).toBeVisible();
  // Umbral crítico <= preventivo → validación del contrato (campo a campo)
  await page.getByLabel("Umbral crítico (%)").fill("80");
  await page.getByRole("button", { name: "Publicar nueva versión" }).click();
  await expect(page.getByText("Debe ser mayor que el umbral preventivo").first()).toBeVisible();
  await noA11yViolations(page);
});

test("monitoreo: alertas M8 — reconocer antes de cerrar", async ({ page }) => {
  await login(page, "admin@vitasmarta.co", "123456");
  await page.goto("/es-CO/monitoreo");
  await expect(page.getByText("Salud de los servicios").first()).toBeVisible();
  await noA11yViolations(page);
  await page.getByRole("tab", { name: "Alertas ambientales" }).click();
  await page.getByRole("button", { name: /^Reconocer atr-001/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Alerta reconocida")).toBeVisible();
});

test("analítica: exportación asíncrona con polling hasta 'Descargar reporte listo'; autoridad solo lee", async ({ page, browser }) => {
  await login(page, "analista@vitasmarta.co");
  await page.goto("/es-CO/analitica");
  await expect(page.getByRole("heading", { level: 1, name: "Analítica turística" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Atractivos más consultados" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Mapa de calor de afluencia" })).toBeVisible();
  await noA11yViolations(page);

  await page.getByRole("button", { name: "Exportar PDF" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  const download = page.getByRole("button", { name: "Descargar reporte listo" });
  await expect(download).toBeVisible({ timeout: 20_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toMatch(/reporte-.*\.pdf/);

  // Autoridad ambiental: vista de solo lectura agregada
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, "autoridad@vitasmarta.co");
  await p.goto("/es-CO/sostenibilidad");
  await expect(p.getByRole("heading", { level: 1, name: "Sostenibilidad" })).toBeVisible();
  await expect(p.getByRole("table", { name: "Indicadores por atractivo" })).toBeVisible();
  await noA11yViolations(p);
  await p.goto("/es-CO/admin");
  await expect(p.getByText("No tienes acceso a esta sección")).toBeVisible();
  await ctx.close();
});

test("inglés: el catálogo y la ficha respetan el idioma activo y Accept-Language", async ({ page }) => {
  const langs: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/bff/api/v1/catalogo/")) langs.push(r.headers()["accept-language"]);
  });
  await page.goto("/en-US/atractivo/atr-001");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tayrona National Natural Park");
  await expect(page.getByRole("heading", { name: "Environmental good practices" })).toBeVisible();
  expect(langs.length).toBeGreaterThan(0);
  expect(langs.every((l) => l === "en-US")).toBe(true);
  await noA11yViolations(page);
});
