// Colours for the 3D flat. Accent colours come from the page's CSS variables (--red, --green,
// --paper, --ink...) so the flat matches the rest of the app in light and dark mode; the
// furniture colours are fixed per mode, apart from the paint, floor and fabric the house picked
// in the decor picker (withDecor).
import type { Decor } from "../../hooks/useHouseholdData";

export interface ScenePalette {
  night: boolean;
  red: string;
  green: string;
  paper: string;
  ink: string;
  muted: string;
  base: string;
  wall: string;
  wallCap: string;
  floorKitchen: string;
  floorBath: string;
  floorLiving: string;
  floorHall: string;
  floorBedroom: string;
  wood: string;
  woodDark: string;
  white: string;
  metal: string;
  dark: string;
  fabric: string;
  rug: string;
  plant: string;
  windowGlass: string;
  sky: string;
  ground: string;
}

function cssVar(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const value = styles?.getPropertyValue(name).trim();
  return value || fallback;
}

/** Reads the current theme's CSS variables from the app shell. */
export function readPalette(night: boolean): ScenePalette {
  const shell = document.querySelector(".app-shell");
  const styles = shell ? getComputedStyle(shell) : null;
  const red = cssVar(styles, "--red", night ? "#f05b52" : "#d73932");
  return {
    night,
    red,
    green: cssVar(styles, "--green", night ? "#9cc9a5" : "#51795f"),
    paper: cssVar(styles, "--paper", night ? "#222426" : "#f5f4f1"),
    ink: cssVar(styles, "--ink", night ? "#f1efec" : "#242323"),
    muted: cssVar(styles, "--muted", night ? "#a7a29c" : "#77736f"),
    base: night ? "#2b2d31" : "#cfcac3",
    wall: night ? "#4a4c52" : "#ece7df",
    wallCap: night ? "#5d6067" : "#d9d2c7",
    floorKitchen: night ? "#4c4a47" : "#e3ddd2",
    floorBath: night ? "#41505a" : "#cfe0e6",
    floorLiving: night ? "#5a4636" : "#c79f72",
    floorHall: night ? "#4d4a48" : "#d8cfc4",
    floorBedroom: night ? "#4a4256" : "#cdbfd9",
    wood: night ? "#7a5a3f" : "#b98a5c",
    woodDark: night ? "#5a3f2b" : "#8a6040",
    white: night ? "#c9c8c4" : "#fbfaf7",
    metal: night ? "#8d9096" : "#b8bcc2",
    dark: night ? "#1b1c1f" : "#3a3a3d",
    fabric: red,
    rug: night ? "#3d4a5c" : "#5a7698",
    plant: night ? "#5f8f62" : "#5c9a5f",
    windowGlass: night ? "#ffd37a" : "#bfe3f5",
    sky: night ? "#2a3050" : "#ffffff",
    ground: night ? "#1a1a1e" : "#bdb4a8",
  };
}

type Shade = { day: string; night: string };

const WALLS: Record<Exclude<Decor["walls"], "classic">, { wall: Shade; cap: Shade }> = {
  sage: { wall: { day: "#dfe6d6", night: "#47524a" }, cap: { day: "#c8d2bd", night: "#58655b" } },
  blush: { wall: { day: "#f1dcd6", night: "#5a4549" }, cap: { day: "#dfc3ba", night: "#6d5459" } },
  navy: { wall: { day: "#c9d3e3", night: "#353f55" }, cap: { day: "#b0bdd1", night: "#46516a" } },
};

const FLOORS: Record<Exclude<Decor["floor"], "oak">, { living: Shade; hall: Shade }> = {
  walnut: { living: { day: "#8a5f3e", night: "#4a3427" }, hall: { day: "#b49a80", night: "#463c35" } },
  grey: { living: { day: "#b9b6b0", night: "#4e4f52" }, hall: { day: "#d4d2ce", night: "#47484b" } },
};

const FABRICS: Record<"mustard" | "grey", Shade> = {
  mustard: { day: "#d9a53a", night: "#b88a35" },
  grey: { day: "#8c8f96", night: "#6a6d74" },
};

/** The palette with the house's chosen wall paint, floorboards and sofa fabric applied. */
export function withDecor(p: ScenePalette, decor: Decor): ScenePalette {
  const pick = (shade: Shade) => (p.night ? shade.night : shade.day);
  const next = { ...p };
  if (decor.walls !== "classic") {
    next.wall = pick(WALLS[decor.walls].wall);
    next.wallCap = pick(WALLS[decor.walls].cap);
  }
  if (decor.floor !== "oak") {
    next.floorLiving = pick(FLOORS[decor.floor].living);
    next.floorHall = pick(FLOORS[decor.floor].hall);
  }
  if (decor.upholstery === "green") next.fabric = p.green;
  else if (decor.upholstery !== "red") next.fabric = pick(FABRICS[decor.upholstery]);
  return next;
}
