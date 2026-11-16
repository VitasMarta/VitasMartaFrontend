import { isoDay } from "../shared";

export type NivelMock = "NOMINAL" | "RECOMENDACION" | "PREVENTIVO" | "CRITICO";

export interface CatalogoMock {
  id: string;
  tipo: "atractivo" | "actividad" | "evento";
  nombre: Record<string, string>;
  descripcion: Record<string, string>;
  categorias: string[];
  ubicacion: { lat: number; lng: number };
  precio: number | null;
  ocupacion: number;
  natural: boolean;
  popularidad: number;
  imagen: string;
  atributos: Record<string, unknown>;
  prestador_ref: string;
}

export const nivelDe = (ocupacion: number): NivelMock =>
  ocupacion >= 90 ? "CRITICO" : ocupacion >= 85 ? "PREVENTIVO" : ocupacion >= 80 ? "RECOMENDACION" : "NOMINAL";

const POLITICA = { politica_ref: "pol-cancelacion-24h", version: 3 };

export const CATALOGO: CatalogoMock[] = [
  {
    id: "atr-001",
    tipo: "atractivo",
    nombre: { "es-CO": "Parque Nacional Natural Tayrona", "en-US": "Tayrona National Natural Park" },
    descripcion: {
      "es-CO": "Bahías de arena blanca entre la selva y la Sierra Nevada. Un ecosistema frágil que recibe visitantes todo el año: reserva tu franja para ayudarnos a cuidar su capacidad de carga.",
      "en-US": "White-sand bays between the rainforest and the Sierra Nevada. A fragile ecosystem that welcomes visitors all year: book a time slot to help us protect its carrying capacity.",
    },
    categorias: ["naturaleza", "ecoturismo", "playa"],
    ubicacion: { lat: 11.3125, lng: -74.0361 },
    precio: 62000,
    ocupacion: 86.4,
    natural: true,
    popularidad: 98,
    imagen: "/mock/tayrona.svg",
    prestador_ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    atributos: {
      duracion_recomendada: "6 a 8 horas",
      nivel_dificultad: "Media",
      accesibilidad: "Senderos parcialmente accesibles",
      que_llevar: ["Agua", "Repelente biodegradable", "Calzado cerrado"],
      requisitos: [],
      observaciones: null,
    },
  },
  {
    id: "atr-002",
    tipo: "atractivo",
    nombre: { "es-CO": "Cascadas de Marinka", "en-US": "Marinka Waterfalls" },
    descripcion: {
      "es-CO": "Caídas de agua en la Sierra Nevada, ideales para una visita tranquila rodeada de bosque.",
      "en-US": "Waterfalls in the Sierra Nevada, ideal for a quiet visit surrounded by forest.",
    },
    categorias: ["naturaleza", "aventura"],
    ubicacion: { lat: 11.1197, lng: -74.1141 },
    precio: 35000,
    ocupacion: 28.5,
    natural: true,
    popularidad: 71,
    imagen: "/mock/marinka.svg",
    prestador_ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    atributos: { nivel_dificultad: "Baja", mejor_epoca: "Diciembre a abril", incluye: ["Guía local"] },
  },
  {
    id: "atr-003",
    tipo: "atractivo",
    nombre: { "es-CO": "Quinta de San Pedro Alejandrino", "en-US": "Quinta de San Pedro Alejandrino" },
    descripcion: {
      "es-CO": "Hacienda histórica donde pasó sus últimos días Simón Bolívar, con jardines y museo.",
      "en-US": "Historic estate where Simón Bolívar spent his final days, with gardens and a museum.",
    },
    categorias: ["cultura"],
    ubicacion: { lat: 11.2276, lng: -74.1869 },
    precio: 28000,
    ocupacion: 45,
    natural: false,
    popularidad: 83,
    imagen: "/mock/quinta.svg",
    prestador_ref: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    atributos: { horario: "Lunes a domingo, 9:30 a 16:30", accesibilidad: "Totalmente accesible", idiomas_guia: ["Español", "Inglés"] },
  },
  {
    id: "atr-004",
    tipo: "atractivo",
    nombre: { "es-CO": "Mirador de la Ciénaga Grande", "en-US": "Ciénaga Grande Viewpoint" },
    descripcion: {
      "es-CO": "Observación de aves y atardeceres sobre la laguna costera más grande de Colombia.",
      "en-US": "Birdwatching and sunsets over Colombia's largest coastal lagoon.",
    },
    categorias: ["naturaleza", "ecoturismo"],
    ubicacion: { lat: 10.9, lng: -74.45 },
    precio: 25000,
    ocupacion: 32,
    natural: true,
    popularidad: 54,
    imagen: "/mock/cienaga.svg",
    prestador_ref: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    atributos: { mejor_epoca: "Todo el año", avistamiento: ["Garzas", "Flamencos"] },
  },
  {
    id: "atr-005",
    tipo: "actividad",
    nombre: { "es-CO": "Ruta del café en Minca", "en-US": "Minca coffee route" },
    descripcion: {
      "es-CO": "Recorrido por fincas cafeteras con degustación y caminata a miradores.",
      "en-US": "Tour of coffee farms with tasting and a hike to viewpoints.",
    },
    categorias: ["aventura", "gastronomia", "naturaleza"],
    ubicacion: { lat: 11.1438, lng: -74.1167 },
    precio: 95000,
    ocupacion: 55,
    natural: true,
    popularidad: 77,
    imagen: "/mock/minca.svg",
    prestador_ref: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    atributos: { duracion_minutos: 300, nivel_dificultad: "Media", edad_minima: 12, equipamiento: ["Botas de caminata"] },
  },
  {
    id: "atr-006",
    tipo: "actividad",
    nombre: { "es-CO": "Ruta gastronómica por el Centro Histórico", "en-US": "Historic Center food route" },
    descripcion: {
      "es-CO": "Seis paradas con sabores samarios: ceviches, arepas de huevo y dulces tradicionales.",
      "en-US": "Six stops with Santa Marta flavors: ceviche, egg arepas and traditional sweets.",
    },
    categorias: ["gastronomia", "cultura"],
    ubicacion: { lat: 11.2408, lng: -74.2113 },
    precio: 120000,
    ocupacion: 61,
    natural: false,
    popularidad: 66,
    imagen: "/mock/centro.svg",
    prestador_ref: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    atributos: { duracion_minutos: 180, capacidad_maxima: 12, incluye: ["Degustaciones", "Guía"] },
  },
  {
    id: "atr-007",
    tipo: "evento",
    nombre: { "es-CO": "Festival del Mar", "en-US": "Sea Festival" },
    descripcion: {
      "es-CO": "Música, danza y gastronomía frente al mar durante cuatro días de fiesta cultural.",
      "en-US": "Music, dance and food by the sea over four days of cultural celebration.",
    },
    categorias: ["cultura", "gastronomia"],
    ubicacion: { lat: 11.2447, lng: -74.2191 },
    precio: null,
    ocupacion: 40,
    natural: false,
    popularidad: 59,
    imagen: "/mock/festival.svg",
    prestador_ref: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    atributos: { modalidad: "presencial", fecha_inicio: isoDay(20), fecha_fin: isoDay(23), cupo_total: 5000 },
  },
  {
    id: "atr-008",
    tipo: "atractivo",
    nombre: { "es-CO": "Playa Cristal", "en-US": "Cristal Beach" },
    descripcion: {
      "es-CO": "Playa de aguas transparentes con cupo restringido por capacidad de carga crítica.",
      "en-US": "Clear-water beach with restricted capacity due to a critical carrying-capacity level.",
    },
    categorias: ["naturaleza", "playa"],
    ubicacion: { lat: 11.3331, lng: -74.0412 },
    precio: 45000,
    ocupacion: 93,
    natural: true,
    popularidad: 90,
    imagen: "/mock/cristal.svg",
    prestador_ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    atributos: { nivel_dificultad: "Baja", restriccion: "Cupo limitado por umbral crítico" },
  },
];

export const politicaDe = () => ({
  ...POLITICA,
  descripcion: {
    "es-CO": "Cancelación gratuita hasta 24 horas antes. Después se aplica una penalidad del 20 %.",
    "en-US": "Free cancellation up to 24 hours before. After that a 20% penalty applies.",
  },
});

export const franjasDe = (id: string) => {
  const horarios: [string, string, number][] = [
    ["07:00", "11:00", 24],
    ["11:30", "15:30", 12],
    ["16:00", "18:00", 0],
  ];
  const franjas = Array.from({ length: 5 }, (_, d) =>
    horarios.map(([ini, fin, cupo], i) => ({
      franja_ref: `${id}-${isoDay(d + 1)}-${ini}`,
      fecha: isoDay(d + 1),
      hora_inicio: ini,
      hora_fin: fin,
      cupo: d === 2 && i === 0 ? 3 : cupo,
      estado: (d === 2 && i === 0 ? 3 : cupo) === 0 ? "AGOTADA" : "DISPONIBLE",
    })),
  ).flat();
  return { id, franjas };
};
