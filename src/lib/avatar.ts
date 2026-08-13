import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

// DiceBear derives every feature (face, hair, outfit, background) from the seed,
// so the same user id always maps to the same avatar across sessions and devices.
const BACKGROUND_COLORS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c8f7c5", "ffe8a3"];

// The full avataaars set also randomises crying, screaming and vomiting faces,
// which read badly on a retro board. Keep the variety, drop the unhappy moods.
const EYES = ["default", "happy", "squint", "wink", "side"] as const;
const EYEBROWS = ["default", "defaultNatural", "flatNatural", "raisedExcited", "raisedExcitedNatural", "upDown"] as const;
const MOUTH = ["smile", "twinkle", "default", "serious"] as const;

const cache = new Map<string, string>();

export function avatarUrl(seed: string): string {
  const key = seed || "anonymous";
  const cached = cache.get(key);
  if (cached) return cached;

  const uri = createAvatar(avataaars, {
    seed: key,
    radius: 50,
    backgroundColor: BACKGROUND_COLORS,
    eyes: [...EYES],
    eyebrows: [...EYEBROWS],
    mouth: [...MOUTH],
  }).toDataUri();

  cache.set(key, uri);
  return uri;
}
