const DRINK_SPRITE_DIRECTORY = "/assets/sprites/drink-sprites-transparent/";

const DRINK_SPRITE_FILENAMES = [
  "A_Fedora_spr_0.png", "Absinthe_spr_0.png", "Bad_Touch_spr_0.png",
  "Beer_spr_0.png", "Bleeding_Jane_spr_0.png", "Bloom_Light_spr_0.png",
  "Blue_Fairy_spr_0.png", "Brandtini_spr_0.png", "Cobalt_Velvet_spr_0.png",
  "Crevice_Spike_spr_0.png", "Flaming_Moai_spr_0.png", "Fluffy_Dream_spr_0.png",
  "Fringe_Weaver_spr_0.png", "Grizzly_Temple_spr_0.png", "Gut_Punch_spr_0.png",
  "Marsblast_spr_0.png", "Mercuryblast_spr_0.png", "Moonblast_spr_0.png",
  "Mulan_Tea_spr_0.png", "Piano_Man_spr_0.png", "Piano_Woman_spr_0.png",
  "Pile_Driver_spr_0.png", "Rum_spr_0.png", "Sparkle_Star_spr_0.png",
  "Sugar_Rush_spr_0.png", "Sunshine_Cloud_spr_0.png", "Suplex_spr_0.png",
  "Zen_Star_spr_0.png",
] as const;

export type BarCounterDrinkSprite =
  | `${typeof DRINK_SPRITE_DIRECTORY}${(typeof DRINK_SPRITE_FILENAMES)[number]}`
  | null;

const listeners = new Set<(sprite: BarCounterDrinkSprite) => void>();
let currentSprite: BarCounterDrinkSprite = null;

function notify(): void {
  for (const listener of listeners) listener(currentSprite);
}

export function getBarCounterDrinkSprite(): BarCounterDrinkSprite {
  return currentSprite;
}

export function showRandomBarCounterDrink(): BarCounterDrinkSprite {
  const choices = DRINK_SPRITE_FILENAMES.filter(
    (filename) => `${DRINK_SPRITE_DIRECTORY}${filename}` !== currentSprite,
  );
  const filename = choices[Math.floor(Math.random() * choices.length)];
  currentSprite = `${DRINK_SPRITE_DIRECTORY}${filename}`;
  notify();
  return currentSprite;
}

export function clearBarCounterDrink(): void {
  if (currentSprite === null) return;
  currentSprite = null;
  notify();
}

export function onBarCounterDrinkChange(
  listener: (sprite: BarCounterDrinkSprite) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
