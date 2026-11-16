import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { renderWithProviders } from "./utils";

vi.mock("@/core/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { EditorialList, EditorialRow } from "@/shared/ui/EditorialRow";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { SlideOver } from "@/shared/ui/SlideOver";
import { Tabs } from "@/shared/ui/Tabs";
import { TextField, SelectField, CheckboxField } from "@/shared/ui/forms";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { MetricRibbon, SplitLayout } from "@/shared/ui/layout";

describe("Zero-Cards · EditorialRow", () => {
  it("una fila = un único enlace (sin enlaces anidados), semántica de lista y sin violaciones axe", async () => {
    const { container } = renderWithProviders(
      <EditorialList label="Catálogo">
        <EditorialRow index={1} title="Parque Tayrona" href="/atractivo/1" categories={["Playa", "Ecoturismo"]} actionLabel="Explorar destino" explanation="Por tu interés en naturaleza" />
        <EditorialRow index={2} title="Minca" href="/atractivo/2" actionLabel="Explorar destino" />
      </EditorialList>,
    );
    const list = screen.getByRole("list", { name: "Catálogo" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Playa · Ecoturismo")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("EditorialTable", () => {
  it("usa <table>, <th scope=col> y caption; sin violaciones axe", async () => {
    const { container } = renderWithProviders(
      <EditorialTable
        caption="Usuarios"
        columns={[
          { key: "a", header: "Correo", cell: (r: { a: string }) => r.a },
          { key: "b", header: "Rol", cell: () => "TURISTA" },
        ]}
        rows={[{ a: "x@y.co" }]}
        rowKey={(r) => r.a}
      />,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("scope", "col");
    expect(screen.getByRole("table", { name: "Usuarios" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Tabs · teclado", () => {
  it("las flechas mueven la selección y solo la pestaña activa está en el orden de Tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tabs
        label="Secciones"
        tabs={[
          { id: "a", label: "Uno", content: <p>Contenido uno</p> },
          { id: "b", label: "Dos", content: <p>Contenido dos</p> },
        ]}
      />,
    );
    const [uno, dos] = screen.getAllByRole("tab");
    expect(uno).toHaveAttribute("aria-selected", "true");
    expect(uno).toHaveAttribute("tabindex", "0");
    expect(dos).toHaveAttribute("tabindex", "-1");
    uno.focus();
    await user.keyboard("{ArrowRight}");
    expect(dos).toHaveAttribute("aria-selected", "true");
    expect(dos).toHaveFocus();
    expect(screen.getByText("Contenido dos")).toBeVisible();
    await user.keyboard("{Home}");
    expect(uno).toHaveFocus();
  });
});

describe("SlideOver · diálogo accesible", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Abrir</button>
        <SlideOver open={open} onClose={() => setOpen(false)} title="Cancelar reserva">
          <label>
            Motivo <input />
          </label>
          <button>Confirmar</button>
        </SlideOver>
      </>
    );
  }

  it("enfoca el primer campo, atrapa el foco, cierra con Escape y devuelve el foco al disparador", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Cancelar reserva" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("textbox")).toHaveFocus();

    await user.tab(); // → Confirmar
    await user.tab(); // → vuelve al principio (cierre) sin salir del diálogo
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("Formularios accesibles", () => {
  it("asocia label, ayuda y error (aria-describedby, aria-invalid) y pasa axe", async () => {
    const { container } = renderWithProviders(
      <form>
        <TextField label="Correo" name="correo" type="email" required hint="Usa tu correo personal" error="Correo inválido" />
        <SelectField label="Rol" name="rol">
          <option value="a">A</option>
        </SelectField>
        <CheckboxField label="Acepto los términos" name="terminos" required />
      </form>,
    );
    const input = screen.getByLabelText(/Correo/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("field-correo-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Correo inválido");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Indicadores", () => {
  it("la sostenibilidad crítica se comunica con texto (no solo con color)", () => {
    renderWithProviders(<SustainabilityIndicator level="CRITICO" occupancy={92} />);
    expect(screen.getByText("Nivel crítico")).toBeInTheDocument();
    expect(screen.getByText(/92 %/)).toBeInTheDocument();
  });

  it("calcula el nivel con los umbrales 80/85/90", () => {
    expect(levelFromOccupancy(32)).toBe("NOMINAL");
    expect(levelFromOccupancy(80)).toBe("RECOMENDACION");
    expect(levelFromOccupancy(85)).toBe("PREVENTIVO");
    expect(levelFromOccupancy(90)).toBe("CRITICO");
  });
});

describe("Layouts", () => {
  it("MetricRibbon usa lista de definición y SplitLayout expone el lienzo derecho como aside etiquetado", async () => {
    const { container } = renderWithProviders(
      <>
        <MetricRibbon label="Resumen" items={[{ label: "Reservas", value: "128", delta: "+5 %" }]} />
        <SplitLayout left={<p>Izq</p>} right={<p>Der</p>} rightLabel="Reservar" />
      </>,
    );
    expect(screen.getByRole("complementary", { name: "Reservar" })).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
