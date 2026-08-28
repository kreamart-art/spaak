import type { ZoneConfig } from "./types.ts";

export const ZONES: readonly ZoneConfig[] = [
  {
    id: "jordaan",
    naam: "Jordaan",
    bbox: [52.37, 4.878, 52.383, 4.892],
    route: ["Brouwersgracht", "Prinsengracht"],
  },
  {
    id: "wallen",
    naam: "De Wallen",
    bbox: [52.37, 4.894, 52.379, 4.902],
    route: ["Oudezijds Voorburgwal"],
  },
  {
    id: "vondelpark",
    naam: "Vondelpark",
    bbox: [52.354, 4.863, 52.362, 4.88],
    route: ["Vondelpark"],
  },
];

export function findZone(id: string): ZoneConfig | undefined {
  return ZONES.find((z) => z.id === id);
}
