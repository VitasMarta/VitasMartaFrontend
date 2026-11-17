import { Suspense } from "react";
import { RecoverView } from "@/features/auth/AuthViews";

export default function Page() {
  return (
    <Suspense>
      <RecoverView />
    </Suspense>
  );
}
