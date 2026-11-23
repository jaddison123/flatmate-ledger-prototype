// Names and colours for the housemates' avatar options, used by the 3D avatar (Avatar.tsx) and by
// the bedroom doors' look picker. The ids and defaults live in shared/household.mjs (LOOK_OPTIONS),
// which the server checks against. No three.js here, so the picker can use it without the 3D bundle.
import { LOOK_BUILD_MAX, type Look, type LookListPart } from "../../hooks/useHouseholdData";
import { nameColour } from "../../lib/nameColour";

export interface LookPartInfo<P extends LookListPart> {
  label: string;
  options: Record<Look[P], string>;
  /** Colour chip per option, for the colour choices. */
  swatches?: Partial<Record<Look[P], string>>;
}

export const SKIN_COLOURS: Record<Look["skin"], string> = {
  porcelain: "#f6d9c4", fair: "#f1c9a5", light: "#e8b894", tan: "#d9a066",
  olive: "#bf8f5f", brown: "#a8714a", deep: "#7a4b2f", ebony: "#55331f",
};

export const HAIR_COLOURS: Record<Look["hairColour"], string> = {
  black: "#1d1d1d", brown: "#5a3b22", chestnut: "#8a3b2a", blonde: "#d8b465",
  ginger: "#c7612b", grey: "#a9a9a9", pink: "#e27aa8", blue: "#4a7fd1",
};

const TOP_COLOURS: Record<Exclude<Look["topColour"], "name">, string> = {
  red: "#d73932", orange: "#e8823a", yellow: "#e9c344", green: "#4f9a5c", teal: "#2a9d9f",
  blue: "#3f6fc4", purple: "#7a55c7", black: "#2a2a2e", white: "#eeeae2",
};

export const BOTTOM_COLOURS: Record<Look["bottomColour"], string> = {
  denim: "#4a6a9a", black: "#25252a", grey: "#7c7f86", khaki: "#b8a173", navy: "#2c3a5e", brown: "#6b4a32",
};

/** The top's colour: a fixed one, or the person's own colour (as on their door and in chat). */
export function topColour(look: Look, name: string): string {
  return look.topColour === "name" ? nameColour(name) : TOP_COLOURS[look.topColour];
}

/** A shirt collar or open jacket's inside: white, unless the top is white itself. */
export function trimColour(look: Look): string {
  return look.topColour === "white" ? "#b9bcc4" : "#f4f1e8";
}

export const LOOK_PARTS: { [P in LookListPart]: LookPartInfo<P> } = {
  skin: {
    label: "Skin",
    options: {
      porcelain: "Porcelain", fair: "Fair", light: "Light", tan: "Tan",
      olive: "Olive", brown: "Brown", deep: "Deep", ebony: "Ebony",
    },
    swatches: SKIN_COLOURS,
  },
  hair: {
    label: "Hairstyle",
    options: {
      short: "Short", buzz: "Buzz cut", quiff: "Quiff", curly: "Curly", bob: "Bob",
      long: "Long", ponytail: "Ponytail", bun: "Bun", afro: "Afro", bald: "Bald",
    },
  },
  hairColour: {
    label: "Hair colour",
    options: {
      black: "Black", brown: "Brown", chestnut: "Auburn", blonde: "Blonde",
      ginger: "Ginger", grey: "Grey", pink: "Pink", blue: "Blue",
    },
    swatches: HAIR_COLOURS,
  },
  top: {
    label: "Top",
    options: { tee: "T-shirt", hoodie: "Hoodie", shirt: "Shirt", jacket: "Jacket", stripes: "Stripy jumper" },
  },
  topColour: {
    label: "Top colour",
    options: {
      name: "Their colour", red: "Red", orange: "Orange", yellow: "Yellow", green: "Green",
      teal: "Teal", blue: "Blue", purple: "Purple", black: "Black", white: "White",
    },
    swatches: TOP_COLOURS, // "name" gets the person's colour in the picker
  },
  bottoms: {
    label: "Bottoms",
    options: { trousers: "Trousers", shorts: "Shorts", skirt: "Skirt" },
  },
  bottomColour: {
    label: "Bottoms colour",
    options: { denim: "Denim", black: "Black", grey: "Grey", khaki: "Khaki", navy: "Navy", brown: "Brown" },
    swatches: BOTTOM_COLOURS,
  },
  extra: {
    label: "Extra",
    options: {
      none: "Nothing", glasses: "Glasses", shades: "Sunglasses", beanie: "Beanie",
      cap: "Cap", headphones: "Headphones",
    },
  },
};

/** The order the picker shows the list parts in (the build slider comes first). */
export const LOOK_ORDER: LookListPart[] = ["skin", "hair", "hairColour", "top", "topColour", "bottoms", "bottomColour", "extra"];

/** Body widths (world units, radius) for a build: male end broad shoulders, female end wider hips. */
export function bodyShape(build: number): { shoulders: number; waist: number; hips: number } {
  const t = Math.min(1, Math.max(0, build / LOOK_BUILD_MAX));
  const mix = (male: number, female: number) => male + (female - male) * t;
  return { shoulders: mix(0.23, 0.16), waist: mix(0.2, 0.145), hips: mix(0.21, 0.26) };
}
