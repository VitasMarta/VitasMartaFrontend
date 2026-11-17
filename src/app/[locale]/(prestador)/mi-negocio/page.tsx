import { Suspense } from "react";
import { BusinessView } from "@/features/prestador/PortalViews";

export default function Page() {
  return (
    <Suspense>
      <BusinessView />
    </Suspense>
  );
}
