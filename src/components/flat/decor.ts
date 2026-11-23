// Names for the flat's furniture choices, shown in the mirror's decor picker. The ids and the
// defaults live in shared/household.mjs (DECOR_OPTIONS), which the server checks against.
// No three.js here, so the picker can use it without loading the 3D bundle.
import type { Decor, DecorSlot } from "../../hooks/useHouseholdData";

export interface DecorSlotInfo<S extends DecorSlot> {
  label: string;
  /** Where it is in the flat. */
  where: string;
  options: Record<Decor[S], string>;
  /** Optional colour chip per option (daytime shade), for paint and fabric choices. */
  swatches?: Partial<Record<Decor[S], string>>;
}

export const DECOR_SLOTS: { [S in DecorSlot]: DecorSlotInfo<S> } = {
  walls: {
    label: "Wall paint",
    where: "Whole flat",
    options: { classic: "Magnolia", sage: "Sage", blush: "Blush", navy: "Navy" },
    swatches: { classic: "#ece7df", sage: "#dfe6d6", blush: "#f1dcd6", navy: "#c9d3e3" },
  },
  floor: {
    label: "Floorboards",
    where: "Living room and hallway",
    options: { oak: "Oak", walnut: "Walnut", grey: "Grey wash" },
    swatches: { oak: "#c79f72", walnut: "#8a5f3e", grey: "#b9b6b0" },
  },
  sofa: {
    label: "Seating",
    where: "Living room",
    options: { classic: "Three-seater", corner: "Corner sofa", beanbags: "Beanbags" },
  },
  upholstery: {
    label: "Sofa fabric",
    where: "Living room",
    options: { red: "Tomato", green: "Moss", mustard: "Mustard", grey: "Charcoal" },
    swatches: { red: "#d73932", green: "#51795f", mustard: "#d9a53a", grey: "#8c8f96" },
  },
  rug: {
    label: "Rug",
    where: "Living room",
    options: { rectangle: "Classic", round: "Round", striped: "Striped", none: "Bare floor" },
  },
  plant: {
    label: "Plant",
    where: "Living room corner",
    options: { leafy: "Leafy", cactus: "Cactus", palm: "Palm" },
  },
  lamp: {
    label: "Lighting",
    where: "Living room",
    options: { floor: "Floor lamp", arc: "Arc lamp", fairy: "Fairy lights" },
  },
  kitchen: {
    label: "Kitchen units",
    where: "Kitchen",
    options: { white: "White", wood: "Wood", mint: "Retro mint" },
    swatches: { white: "#fbfaf7", wood: "#b98a5c", mint: "#a8d8c2" },
  },
  table: {
    label: "Kitchen table",
    where: "Kitchen",
    options: { wood: "Farmhouse", round: "Round bistro" },
  },
  bath: {
    label: "Bathroom",
    where: "Bathroom",
    options: { bath: "Bathtub", shower: "Walk-in shower" },
  },
  fridge: {
    label: "Fridge",
    where: "Kitchen · notes",
    options: { classic: "Classic white", retro: "Retro cream", steel: "Steel American" },
    swatches: { classic: "#fbfaf7", retro: "#f1dfb8", steel: "#b8bcc2" },
  },
  tv: {
    label: "TV",
    where: "Living room · league",
    options: { flat: "Flat screen", crt: "Retro CRT", projector: "Projector" },
  },
  board: {
    label: "Chore board",
    where: "Landing · chores",
    options: { whiteboard: "Whiteboard", chalkboard: "Chalkboard", cork: "Corkboard" },
    swatches: { whiteboard: "#fbfbf8", chalkboard: "#2e4136", cork: "#c89b62" },
  },
  frontDoor: {
    label: "Front door",
    where: "Hallway · house settings",
    options: { red: "Pillar-box red", navy: "Navy with glass", green: "Racing green" },
    swatches: { red: "#d73932", navy: "#2c3e66", green: "#2f5d46" },
  },
  mirror: {
    label: "Mirror",
    where: "Bathroom · this menu",
    options: { gilt: "Gilt frame", round: "Round", cabinet: "Mirrored cabinet" },
  },
};

/** Picker order, grouped roughly by room. */
export const DECOR_ORDER: DecorSlot[] = [
  "walls", "floor",
  "sofa", "upholstery", "tv", "rug", "plant", "lamp",
  "kitchen", "fridge", "table",
  "bath", "mirror",
  "board", "frontDoor",
];
