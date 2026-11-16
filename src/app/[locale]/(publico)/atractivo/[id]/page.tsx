import { FichaView } from "@/features/catalogo/FichaView";

export default async function AtractivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaView id={id} />;
}
