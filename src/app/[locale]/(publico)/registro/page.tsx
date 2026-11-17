import { Suspense } from "react";
import { RegisterView } from "@/features/auth/AuthViews";

export default function Page() {
  return (
    <Suspense>
      <RegisterView />
    </Suspense>
  );
}
