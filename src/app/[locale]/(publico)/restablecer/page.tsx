import { Suspense } from "react";
import { ResetView } from "@/features/auth/AuthViews";

export default function Page() {
  return (
    <Suspense>
      <ResetView />
    </Suspense>
  );
}
