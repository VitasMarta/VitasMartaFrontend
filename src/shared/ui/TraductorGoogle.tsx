"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

/**
 * Traducción automática de la página con Google Translate cuando la interfaz está en inglés.
 *
 * La interfaz ya está traducida (next-intl); esto cubre el contenido que el prestador escribió
 * solo en español (descripciones, condiciones…). Toda la UI de Google (barra superior, globo al
 * pasar el cursor, resaltado) se oculta en globals.css (bloque "Google Translate").
 *
 * - Activa: cookie `googtrans=/es/en` + widget oculto con `pageLanguage: "es"`.
 * - Al volver a español se borra la cookie y se recarga: Google no restaura el texto original
 *   por sí mismo.
 * - Google reescribe nodos de texto por debajo de React; el parche de `removeChild` /
 *   `insertBefore` evita el error "Failed to execute 'removeChild'" (facebook/react#11538).
 */
const COOKIE = "googtrans";
const DESTINO = "/es/en";

declare global {
  interface Window {
    google?: { translate?: { TranslateElement: new (opts: Record<string, unknown>, id: string) => unknown } };
    __vmTraductorInit?: () => void;
    __vmParcheDom?: boolean;
  }
}

function dominios(): string[] {
  const host = window.location.hostname;
  // Google escribe la cookie en el host y en el dominio padre; se cubren ambos al borrar.
  const partes = host.split(".");
  return partes.length > 1 ? [host, `.${host}`, `.${partes.slice(-2).join(".")}`] : [host];
}

function fijarCookie(valor: string | null) {
  const base = "path=/; SameSite=Lax";
  if (valor === null) {
    const vencida = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = `${COOKIE}=; ${vencida}; ${base}`;
    for (const d of dominios()) document.cookie = `${COOKIE}=; ${vencida}; domain=${d}; ${base}`;
    return;
  }
  document.cookie = `${COOKIE}=${valor}; ${base}`;
}

const cookieActiva = () => document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`) && c.endsWith(DESTINO));

function parchearDom() {
  if (window.__vmParcheDom || typeof Node !== "function") return;
  window.__vmParcheDom = true;
  const quitar = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, hijo: T): T {
    if (hijo.parentNode !== this) return hijo;
    return quitar.call(this, hijo) as T;
  };
  const insertar = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, nuevo: T, referencia: Node | null): T {
    if (referencia && referencia.parentNode !== this) return nuevo;
    return insertar.call(this, nuevo, referencia) as T;
  };
}

function cargarWidget() {
  if (document.getElementById("vm-google-translate")) return;
  window.__vmTraductorInit = () => {
    const G = window.google?.translate?.TranslateElement;
    if (G) new G({ pageLanguage: "es", includedLanguages: "en", autoDisplay: false }, "google_translate_element");
  };
  const s = document.createElement("script");
  s.id = "vm-google-translate";
  s.src = "https://translate.google.com/translate_a/element.js?cb=__vmTraductorInit";
  s.async = true;
  document.body.appendChild(s);
}

export function TraductorGoogle() {
  const locale = useLocale();

  useEffect(() => {
    if (locale.startsWith("en")) {
      parchearDom();
      fijarCookie(DESTINO);
      cargarWidget();
    } else if (cookieActiva()) {
      fijarCookie(null);
      window.location.reload();
    }
  }, [locale]);

  // Contenedor del widget de Google (oculto): Google lo exige para inicializarse.
  return <div id="google_translate_element" hidden aria-hidden="true" />;
}
