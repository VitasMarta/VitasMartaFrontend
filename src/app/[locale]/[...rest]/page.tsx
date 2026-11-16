import { notFound } from "next/navigation";

/** Rutas desconocidas dentro de un locale → página 404 localizada. */
export default function CatchAll() {
  notFound();
}
