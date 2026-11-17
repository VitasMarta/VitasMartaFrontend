import { notFound } from "next/navigation";
import { OfferEditorView } from "@/features/prestador/OfferViews";
import { TIPOS, type Tipo } from "@/features/prestador/offer";

export default async function Page({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo, id } = await params;
  if (!TIPOS.includes(tipo as Tipo)) notFound();
  // `nuevo` crea un contenido; cualquier otro valor es el id de un contenido existente.
  return <OfferEditorView tipo={tipo as Tipo} id={id === "nuevo" ? undefined : id} />;
}
