export const PROMPTS = [
  'Rain', 'Mirror', 'Keys', 'Salt', 'Attic', 'Hunger', 'Bridge', 'Smoke', 'Letter', 'Winter',
  'Ghost', 'Kitchen', 'Promise', 'Static', 'Harbor', 'Debt', 'Honey', 'Shadow', 'Train', 'Silence',
  'Mother', 'Fever', 'Garden', 'Rust', 'Lies', 'Ocean', 'Candle', 'Stranger', 'Midnight', 'Bones',
  'Summer', 'Envy', 'Window', 'Dust', 'Home', 'Thunder', 'Secret', 'Paper', 'Wolf', 'Regret',
  'Sugar', 'Basement', 'Courage', 'Glass', 'Exile', 'Birthday', 'Ashes', 'Moon', 'Forgiven', 'Road',
  'Teeth', 'Laughter', 'Island', 'Clock', 'Father', 'Snow', 'Betrayal', 'Crown', 'Hospital', 'River',
  'Shame', 'Lantern', 'Bees', 'Goodbye', 'Mountain', 'Coffee', 'Scars', 'Dream', 'Neighbor', 'Storm',
  'Photograph', 'Anger', 'Feathers', 'School', 'Wedding', 'Thirst', 'Maps', 'Orchard', 'Sister', 'Lost',
  'Violin', 'Fog', 'Money', 'Doorway', 'Tide', 'Jealousy', 'Childhood', 'Knife', 'Stars', 'Funeral',
  'Mercy', 'Suitcase', 'Tomorrow', 'Crow', 'Blanket', 'Runaway', 'Ice', 'Luck', 'Echo', 'Hope',
];

export function randomPrompt(except?: string): string {
  const choices = PROMPTS.filter((word) => word !== except);
  return choices[Math.floor(Math.random() * choices.length)];
}
