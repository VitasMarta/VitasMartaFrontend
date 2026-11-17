import { Suspense } from "react";
import { PerfilView } from "@/features/perfil/PerfilView";

export default function Page() {
  return (
    <Suspense>
      <PerfilView />
    </Suspense>
  );
}
