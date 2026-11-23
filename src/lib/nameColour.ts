// Person colours, picked deterministically from a name (like WhatsApp groups). Used by the chat
// and by the housemates' doors and avatars in the 3D flat.
const NAME_COLOURS = ["#6d4bd1", "#e0682e", "#1f8a70", "#c2377a", "#2b7bbd", "#a37a00"];

export function nameColour(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return NAME_COLOURS[hash % NAME_COLOURS.length];
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
