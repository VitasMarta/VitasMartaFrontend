import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Barrido de accesibilidad (RNF-07): recorre TODAS las pantallas de cada rol — con cada pestaña y los
 * paneles deslizantes abiertos — y exige cero violaciones WCAG 2.1 A/AA e identificadores únicos.
 */
const PASSWORD = "Passw0rd!Passw0rd";

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
  await expect(page.getByRole("button", { name: /Cerrar sesión|Sign out/ })).toBeVisible();
}

async function audit(page: Page, label: string) {
  const duplicates = await page.evaluate(() => {
    const seen = new Map<string, number>();
    document.querySelectorAll("[id]").forEach((el) => seen.set(el.id, (seen.get(el.id) ?? 0) + 1));
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const problems = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect({ label, duplicates, problems }).toEqual({ label, duplicates: [], problems: [] });
}

/** Abre la pantalla, espera su h1 y audita cada pestaña (si las tiene). */
async function sweep(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForTimeout(500); // deja resolver las consultas
  await audit(page, url);
  const tabs = page.getByRole("tab");
  const n = await tabs.count();
  for (let i = 1; i < n; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(350);
    await audit(page, `${url} · pestaña ${i + 1}`);
  }
}

const PUBLIC = ["/es-CO", "/en-US", "/es-CO/buscar?categorias=naturaleza", "/es-CO/atractivo/atr-005", "/en-US/buscar", "/es-CO/login", "/es-CO/registro", "/es-CO/recuperar", "/es-CO/restablecer?token=x", "/es-CO/verificacion?token=x", "/es-CO/no-existe"];

test("público: todas las pantallas sin violaciones", async ({ page }) => {
  for (const url of PUBLIC) {
    await page.goto(url);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(400);
    await audit(page, url);
  }
});

test("turista: reservas, detalle con paneles, perfil (todas las pestañas)", async ({ page }) => {
  await login(page, "turista@vitasmarta.co");
  await sweep(page, "/es-CO/mis-reservas");
  await sweep(page, "/es-CO/mi-perfil");
  await page.goto("/es-CO/mis-reservas");
  await page.getByRole("link", { name: /Ver detalle/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await audit(page, "detalle de reserva");
  const cancel = page.getByRole("button", { name: "Cancelar reserva" });
  if (await cancel.count()) {
    await cancel.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit(page, "panel cancelar reserva");
  }
  await sweep(page, "/en-US/mi-perfil");
});

test("prestador: oferta (editor con todas las pestañas), reservas, check-in, indicadores, negocio, onboarding", async ({ page }) => {
  await login(page, "prestador@vitasmarta.co");
  for (const url of ["/es-CO/mi-oferta", "/es-CO/mi-oferta/atractivos/nuevo", "/es-CO/mi-oferta/actividades/act-002", "/es-CO/mi-oferta/eventos/eve-001", "/es-CO/reservas-recibidas", "/es-CO/checkin-qr", "/es-CO/mis-indicadores", "/es-CO/mi-negocio", "/es-CO/onboarding"]) {
    await sweep(page, url);
  }
  await page.goto("/es-CO/mi-oferta/actividades/act-002");
  await page.getByRole("tab", { name: "Franjas" }).click();
  await page.getByRole("button", { name: "Nueva franja" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await audit(page, "panel nueva franja");
  await page.goto("/es-CO/reservas-recibidas");
  await page.getByRole("button", { name: /^Rechazar/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await audit(page, "panel rechazar reserva");
});

test("administrador (MFA): todas las secciones, pestañas y paneles", async ({ page }) => {
  await login(page, "admin@vitasmarta.co", "123456");
  for (const url of ["/es-CO/admin", "/es-CO/admin/usuarios", "/es-CO/admin/matriz", "/es-CO/admin/auditoria", "/es-CO/admin/prestadores", "/es-CO/admin/moderacion", "/es-CO/admin/tipos", "/es-CO/admin/credenciales", "/es-CO/admin/ambiental", "/es-CO/monitoreo", "/es-CO/analitica", "/es-CO/sostenibilidad", "/en-US/admin/usuarios"]) {
    await sweep(page, url);
  }
  await page.goto("/es-CO/admin/usuarios");
  await page.getByRole("button", { name: /^Cambiar rol/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await audit(page, "panel cambiar rol");
  await page.goto("/es-CO/admin/prestadores");
  await page.getByRole("button", { name: /^Gestionar/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await audit(page, "panel gestionar prestador");
  await page.goto("/es-CO/admin/tipos");
  await page.getByRole("button", { name: "Nuevo tipo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await audit(page, "panel tipo de prestador");
});
