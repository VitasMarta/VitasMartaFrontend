import { Suspense } from "react";
import { SearchView } from "@/features/catalogo/SearchView";

export default function SearchPage() {
  // useSearchParams requiere un límite de Suspense.
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
