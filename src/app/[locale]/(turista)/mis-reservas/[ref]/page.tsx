import { ReservationDetailView } from "@/features/reservas/Views";

export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <ReservationDetailView reservaRef={ref} />;
}
