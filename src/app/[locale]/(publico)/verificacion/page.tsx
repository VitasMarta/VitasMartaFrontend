import { Suspense } from "react";
import { VerifyView } from "@/features/auth/AuthViews";

export default function Page() {
  return (
    <Suspense>
      <VerifyView />
    </Suspense>
  );
}
