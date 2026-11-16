import { Suspense } from "react";
import { OnboardingView } from "@/features/prestador/PortalViews";

export default function Page() {
  return (
    <Suspense>
      <OnboardingView />
    </Suspense>
  );
}
