// Layout data for the 3D flat, kept free of three.js so the page can use it without loading
// the 3D bundle.
//
// World units: x runs left→right along the back wall, z runs back→front, y is up. The floor is
// x ∈ [-7, 7], z ∈ [-5, 5]; the camera looks from the front-right corner (+x, +y, +z).
//
//   z=-5 ┌──────────┬────────┬─────────┐
//        │ kitchen  │  bath  │ bedrooms│
//   z=-1 ├──────────┴───┬────┴─────────┤
//        │ living room  │   hallway    │
//   z=5  └──────────────┴───[door]─────┘
//      x=-7           x=1            x=7

export type Vec3 = [number, number, number];

/** Each feature lives somewhere in the flat. */
export type RoomId = "chores" | "league" | "notes" | "bills" | "chat" | "house" | "decor";

export interface RoomInfo {
  label: string;
  /** Where it is, in words (shown in the room nav and the panel heading). */
  place: string;
  icon: string;
  /** Point the camera centres on when this room is open. */
  focus: Vec3;
  /** Zoom relative to the whole-flat view. */
  zoom: number;
}

export const ROOMS: Record<RoomId, RoomInfo> = {
  chores: { label: "Chores", place: "Hallway whiteboard", icon: "✳", focus: [3.2, 1.3, -0.3], zoom: 2.4 },
  league: { label: "League", place: "Living room TV", icon: "♛", focus: [-6.2, 1, 2], zoom: 2.3 },
  notes: { label: "Notes", place: "Kitchen fridge", icon: "✎", focus: [-6, 1.2, -2.3], zoom: 2.3 },
  bills: { label: "Bills", place: "Kitchen table", icon: "£", focus: [-3.2, 0.8, -2.2], zoom: 2.3 },
  chat: { label: "Chat", place: "Living room sofa", icon: "💬", focus: [-4, 0.8, 2], zoom: 1.9 },
  house: { label: "House", place: "Front door", icon: "⌂", focus: [4.5, 1.2, 3.5], zoom: 1.9 },
  // Zoomed out on the whole flat, so you can watch the furniture change as you pick.
  decor: { label: "Decor", place: "Bathroom mirror", icon: "✦", focus: [0.9, 0.3, 1.6], zoom: 0.8 },
};

export const ROOM_ORDER: RoomId[] = ["chores", "league", "notes", "bills", "chat", "house", "decor"];

/** Where a chore's mess appears, guessed from its title. */
export type MessZone = "kitchen" | "bathroom" | "laundry" | "bins" | "living" | "general";

// Checked in order, so "washing up" is caught by the kitchen before laundry sees "washing".
const ZONE_WORDS: [MessZone, RegExp][] = [
  ["bins", /\b(bins?|rubbish|trash|recycl\w*|garbage|waste|compost)\b/i],
  ["kitchen", /\b(dish\w*|kitchen|cook\w*|oven|hob|fridge|counters?|sinks?|washing[ -]up|wash up|microwave|kettle|food|cupboards?)\b/i],
  ["bathroom", /\b(bath\w*|toilets?|loo|showers?|wc|mirrors?|tiles?|basin)\b/i],
  ["laundry", /\b(laundry|washing|clothes|towels?|iron\w*|sheets?|beds?)\b/i],
  ["living", /\b(hoover\w*|vacuum\w*|dust\w*|living|lounge|sofa|tidy\w*|windows?|plants?|floors?|mop\w*|sweep\w*)\b/i],
];

export function messZone(title: string): MessZone {
  return ZONE_WORDS.find(([, pattern]) => pattern.test(title))?.[0] ?? "general";
}

/** Spots for each zone's mess. Extra chores pile onto the last spot. */
export const MESS_SPOTS: Record<MessZone, Vec3[]> = {
  kitchen: [[-3.9, 0.98, -4.6], [-2.9, 0.98, -4.6], [-4.9, 0.98, -4.6], [-5, 0, -3.3]],
  bathroom: [[0.4, 0.01, -3.3], [1.8, 0.01, -2.4], [0, 0.01, -2.2], [2.2, 0.01, -3.5]],
  laundry: [[4.2, 0, -3.2], [5.6, 0, -2.6], [4.8, 0, -1.8], [6.3, 0, -3.6]],
  bins: [[5.6, 0, 5.95], [6.2, 0, 4.2], [5.6, 0, 3.4], [6.5, 0, 3.1]],
  living: [[-2, 0, 0.9], [-4.1, 0, 3.6], [-1.6, 0, 2.6], [-5.9, 0, 0.6]],
  // Kept clear of the whiteboard (WHITEBOARD_SPOT).
  general: [[2, 0, 4.4], [4.6, 0, 0.8], [5.8, 0, 1.6], [1.8, 0, 1.4]],
};

/** Where housemates' avatars hang out (living room). */
export const AVATAR_SPOTS: Vec3[] = [
  [-1.4, 0, 0.2], [-0.9, 0, 3.9], [-3.5, 0, 4.5], [-5.4, 0, -0.1],
  [-0.2, 0, 1.6], [-2.3, 0, 4.6], [-5.6, 0, 3.9], [-2.4, 0, -0.3],
];

/** Bedroom doors along the back wall of the landing. */
export const MAX_BEDROOM_DOORS = 4;

/** The chore whiteboard, in the hallway against the low wall to the bedroom landing. */
export const WHITEBOARD_SPOT: Vec3 = [3.2, 0, -0.3];

/** Where the front door stands (the house settings hotspot). */
export const FRONT_DOOR_SPOT: Vec3 = [4.5, 0, 5.1];

/** Turns the whiteboard (which faces +z when unrotated) to face the front door. */
export const WHITEBOARD_ANGLE = Math.atan2(FRONT_DOOR_SPOT[0] - WHITEBOARD_SPOT[0], FRONT_DOOR_SPOT[2] - WHITEBOARD_SPOT[2]);
