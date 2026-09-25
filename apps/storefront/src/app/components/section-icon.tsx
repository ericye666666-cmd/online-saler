import type { Section } from "../shop-taxonomy";

// Line drawings for the Browse picture row, one per section, drawn on a
// 48-unit grid in the same weight so the row reads as one set.
const PATHS: Record<Section, string[]> = {
  Tops: ["M18 8l-10 5 3.5 7.5 5-2V40h15V18.5l5 2L40 13l-10-5c-1 3-3.2 4.5-6 4.5S19 11 18 8z"],
  Bottoms: ["M14 7h20l2.5 34h-8.5L24 18l-4 23h-8.5z", "M14 12h20"],
  "Jackets & coats": [
    "M18 7l-8 4-4 29h7l2-17v19h18V23l2 17h7l-4-29-8-4",
    "M18 7l6 6 6-6",
    "M24 13v29"
  ],
  "Dresses & skirts": ["M19 6h10l-1 9 4 6 7 21H9l7-21 4-6z", "M16.5 21h15"],
  "Sets & more": [
    "M20.5 12a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.3-1.5 2.4V19",
    "M24 19L6.5 31.5c-1.4 1-.7 3.5 1 3.5h33c1.7 0 2.4-2.5 1-3.5z"
  ],
  Shoes: ["M5 35V17h7l4 4.5h5l8 5.5 10.5 2.8c2.5.7 3.5 2.4 3.5 4.2v1H7a2 2 0 0 1-2-2z", "M5 30h38", "M18 21.5l-2 4M22 23.5l-2 4"],
  Bags: ["M10 17h28l-2.5 24h-23z", "M18 17v-4a6 6 0 0 1 12 0v4"],
  Accessories: [
    "M24 32a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    "M19 17.5L20 8h8l1 9.5M19 30.5L20 40h8l1-9.5",
    "M24 20.5V24l2.5 2"
  ],
  Home: ["M6 11v28M42 39V29a4 4 0 0 0-4-4H6M6 33h36", "M11 25v-3a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3"]
};

export function SectionIcon({ section }: { section: Section }) {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[section].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
