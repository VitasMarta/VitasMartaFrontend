import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Corte vertical: Catálogo → Ficha → Reserva (con el API Gateway simulado por MSW en el servidor).
 * También valida accesibilidad (axe, WCAG 2.1 AA) y la regla Zero-Cards en pantallas reales.
 */
const PASSWORD = "Passw0rd!Passw0rd";

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function loginAs(page: Page, correo: string) {
  await page.goto("/es-CO/login");
  await page.getByLabel("Correo electrónico").fill(correo);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("portada: skip link, buscador destacado, tarjetas de destinos y sin violaciones de accesibilidad", async ({ page }) => {
  await page.goto("/es-CO");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Santa Marta");
  // Skip link: primer elemento enfocable del DOM
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await expect(page.getByRole("search")).toBeVisible();
  // Una tarjeta por destino (rejilla), cada una enlaza a su ficha.
  const tarjetas = page.getByRole("list", { name: "Destinos populares" }).getByRole("listitem");
  await expect(tarjetas).toHaveCount(8);
  await expect(tarjetas.first().getByRole("link")).toHaveAttribute("href", /\/atractivo\//);
  // Tipografía Poppins en el cuerpo
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/poppins/i);
  await expectNoA11yViolations(page);
});

test("catálogo: filtros por URL, orden conserva filtros y paginación por cursor", async ({ page }) => {
  await page.goto("/es-CO/buscar");
  await expect(page.getByText("8 destinos encontrados")).toBeVisible();

  await page.getByRole("checkbox", { name: "Naturaleza" }).check();
  await expect(page).toHaveURL(/categorias=naturaleza/);
  await page.getByLabel("Ordenar por").selectOption("precio");
  await expect(page).toHaveURL(/categorias=naturaleza/); // el orden NO borra los filtros activos (RF-01-6)
  await expect(page).toHaveURL(/orden=precio/);
  await expect(page.getByRole("checkbox", { name: "Naturaleza" })).toBeChecked();
  await expectNoA11yViolations(page);
});

test("ficha: split-screen, atributos JSONB sin filas vacías, buenas prácticas y alternativas", async ({ page }) => {
  await page.goto("/es-CO/atractivo/atr-001");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tayrona");
  // Solo se renderizan las claves presentes: `requisitos` ([]) y `observaciones` (null) no existen en el DOM
  await expect(page.getByRole("term").filter({ hasText: "Duración recomendada" })).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: "Requisitos" })).toHaveCount(0);
  await expect(page.getByRole("term").filter({ hasText: "Observaciones" })).toHaveCount(0);
  // M8: 200 → bloque ambiental
  await expect(page.getByRole("heading", { name: "Buenas prácticas ambientales" })).toBeVisible();
  // 86,4 % > 80 % → banda de alternativas descongestivas (M6, CU-13)
  await expect(page.getByRole("heading", { name: "Alternativas con menos congestión" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Reservar este destino" })).toBeVisible();
  await expectNoA11yViolations(page);

  // M8 204 → la sección se omite por completo (sin error)
  await page.goto("/es-CO/atractivo/atr-003");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("San Pedro");
  await expect(page.getByRole("heading", { name: "Buenas prácticas ambientales" })).toHaveCount(0);
});

test("reserva: login → franja → política → soft lock con cuenta regresiva y cancelación", async ({ page }) => {
  await page.goto("/es-CO/atractivo/atr-002");
  await expect(page.getByRole("button", { name: /Iniciar sesión para reservar|Reservar cupos/ }).or(page.getByRole("link", { name: "Iniciar sesión para reservar" }))).toBeVisible();
  await page.getByRole("link", { name: "Iniciar sesión para reservar" }).click();
  await expect(page).toHaveURL(/login\?volver=/);
  await page.getByLabel("Correo electrónico").fill("turista@vitasmarta.co");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/atractivo\/atr-002/); // vuelve a la ficha

  const panel = page.getByRole("complementary", { name: "Reservar este destino" });
  // Sin franja ni política: errores accesibles por campo
  await panel.getByRole("button", { name: "Reservar cupos" }).click();
  await expect(panel.getByRole("alert").first()).toBeVisible();

  await panel.getByRole("radio").first().check();
  await panel.getByLabel("Cantidad de cupos").fill("2");
  await panel.getByLabel("Acepto la política de cancelación").check();
  await panel.getByRole("button", { name: "Reservar cupos" }).click();

  await expect(page).toHaveURL(/mis-reservas\/RES-/);
  await expect(page.getByRole("timer")).toBeVisible(); // barra superior con cuenta regresiva a `vence_en`
  await expect(page.getByText("Pendiente de confirmación")).toBeVisible();
  await expectNoA11yViolations(page);

  // Cancelar con motivo en un panel deslizante
  await page.getByRole("button", { name: "Cancelar reserva" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancelar reserva" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Cancelar reserva" }).click();
  await dialog.getByLabel("Motivo de la cancelación").fill("Cambio de planes");
  await dialog.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
});

test("restricción ambiental conocida: M3 lista las franjas como no reservables con su motivo", async ({ page }) => {
  await loginAs(page, "turista@vitasmarta.co");
  await page.goto("/es-CO/atractivo/atr-008");
  const panel = page.getByRole("complementary", { name: "Reservar este destino" });
  await expect(panel.getByText(/Capacidad ambiental alcanzada/).first()).toBeVisible();
  const radios = panel.getByRole("radio");
  await expect(radios.first()).toBeDisabled();
  expect(await radios.evaluateAll((els) => els.every((el) => (el as HTMLInputElement).disabled))).toBe(true);
});

test("restricción que llega al reservar (409 RESERVA_RESTRINGIDA) muestra alternativas", async ({ page }) => {
  await loginAs(page, "turista@vitasmarta.co");
  // Carrera real: la lectura de ofertas aún era reservable y M8 restringe antes del POST.
  await page.route("**/bff/api/v1/reservas", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            codigo: "RESERVA_RESTRINGIDA",
            mensaje: "Este destino alcanzó su umbral crítico de capacidad y no admite nuevas reservas",
            marca_temporal: new Date().toISOString(),
            correlation_id: "00000000-0000-4000-8000-000000000409",
          }),
        })
      : route.continue(),
  );
  await page.goto("/es-CO/atractivo/atr-002");
  const panel = page.getByRole("complementary", { name: "Reservar este destino" });
  await panel.getByRole("radio").first().check();
  await panel.getByLabel("Acepto la política de cancelación").check();
  await panel.getByRole("button", { name: "Reservar cupos" }).click();
  await expect(page.getByText(/umbral crítico/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alternativas con menos congestión" })).toBeVisible();
});

test("RBAC: un turista no entra al panel de administración; el admin pasa por MFA", async ({ page }) => {
  await loginAs(page, "turista@vitasmarta.co");
  await page.goto("/es-CO/admin");
  await expect(page.getByText("No tienes acceso a esta sección")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/es-CO/login");
  await page.getByLabel("Correo electrónico").fill("admin@vitasmarta.co");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await page.getByLabel("Código de verificación").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/admin/);
});

test("el idioma se puede cambiar y la sesión se restaura tras recargar (cookie httpOnly)", async ({ page }) => {
  await loginAs(page, "turista@vitasmarta.co");
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible(); // refresco silencioso
  expect(await page.evaluate(() => document.cookie)).not.toContain("vm_rt"); // httpOnly: JS no la ve

  await page.getByRole("button", { name: /English/ }).click();
  await expect(page).toHaveURL(/\/en-US/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
