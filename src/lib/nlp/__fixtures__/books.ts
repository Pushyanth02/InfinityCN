/**
 * Deterministic narrative fixtures for the Narrative Intelligence Engine tests.
 * Each fixture is representative of a distinct narrative shape. They are plain
 * string constants (no randomness) so every run is byte-identical.
 */

/** Two speakers, heavy attributed dialogue. */
export const DIALOGUE_HEAVY = [
  'The Quarrel',
  'Anna and Ben sat by the fire.',
  '"Where were you tonight?" Anna asked.',
  '"I was down at the harbor," Ben replied.',
  '"You lied to me," Anna said.',
  '"I never lied to you," Ben answered.',
  'Anna stood and crossed the room. "Then explain the letter," Anna demanded.',
  '"The letter meant nothing," Ben muttered.',
  'Ben reached for her hand. Anna pulled away.',
  '"Nothing? It meant nothing?" Anna cried.',
  '"Please, listen to me," Ben whispered.',
].join('\n\n')

/** A chaptered novel with clear structural headings. */
export const CHAPTERED = [
  'The Long Road',
  'Chapter One',
  'The village slept under a grey sky. Tom walked the empty road, his boots heavy with mud.',
  'He had left home at dawn, carrying only a satchel and a promise.',
  'Chapter Two',
  'By nightfall Tom reached the city gates. The guards watched him closely as he passed.',
  'Inside the walls, lanterns burned along every street.',
  'Chapter Three',
  'Tom found the old inn near the market square. A fire crackled in the hearth.',
  'He ordered bread and waited, listening to the rain against the window.',
  'Chapter Four',
  'At last the stranger arrived. "You came," the man said. Tom nodded and drew his blade.',
  'They fought in the narrow yard until the stranger fell. Tom stood alone, breathing hard.',
  'Chapter Five',
  'The storm passed by morning. Tom left the city and returned home, the promise kept.',
].join('\n\n')

/** Two co-equal protagonists sharing the narrative. */
export const MULTI_PROTAGONIST = [
  'Two Paths',
  'Elena studied the map while Marcus sharpened his sword.',
  '"We should go north," Elena said.',
  '"The south road is safer," Marcus replied.',
  'Elena traced the river with her finger. Marcus shook his head.',
  'They argued for an hour. Elena won. Marcus agreed, reluctantly.',
  'The next day Elena led the way. Marcus followed, watching the ridgeline.',
  'Elena spotted the tower first. "There," Elena whispered. Marcus nodded.',
  'Marcus climbed the wall. Elena covered him from below.',
  'Together Elena and Marcus reached the summit at dusk.',
].join('\n\n')

/** A hero opposed by multiple antagonists, with conflict/violence signals. */
export const MULTI_ANTAGONIST = [
  'The Siege',
  'Kael defended the gate as the enemy advanced.',
  'Vorn attacked from the left, his axe flashing. Kael blocked the blow.',
  'Draxa struck from the shadows. Kael turned and parried the dagger.',
  '"You cannot win," Vorn snarled. Kael said nothing.',
  'Draxa lunged again. Kael dodged and struck back, wounding her arm.',
  'Vorn roared and charged. The two clashed, swords ringing.',
  'Kael fought Vorn and Draxa through the burning courtyard.',
  'At last Vorn fell. Draxa fled into the smoke. Kael stood, bloodied but alive.',
].join('\n\n')

/** Sparse, dialogue-free description — tests low-signal robustness. */
export const LOW_DIALOGUE = [
  'The Meadow',
  'The meadow stretched golden under the afternoon sun. A gentle wind moved through the tall grass.',
  'Bees drifted between the wildflowers, and the distant river murmured over smooth stones.',
  'Clouds gathered slowly above the far hills, pale and unhurried.',
  'The light softened toward evening, and the colors of the field deepened into amber and rose.',
  'A single heron crossed the sky, its wings slow against the fading blue.',
  'Night settled over the meadow, quiet and vast, and the stars appeared one by one.',
].join('\n\n')

/** Alias + nickname resolution fixture. */
export const ALIASES = [
  'The Garden',
  'Elizabeth Bennet walked through the garden. Elizabeth loved the roses there.',
  '"Good morning," said Elizabeth Bennet.',
  'Her sister often called her Lizzy. "Lizzy, come inside," Jane said.',
  'Lizzy smiled at Jane. Elizabeth Bennet nodded and followed her in.',
  'Jane laughed. Elizabeth laughed too.',
].join('\n\n')

/** Pronoun-resolution fixture (single clear female antecedent). */
export const PRONOUNS = [
  'Sarah entered the quiet room. She was tired from the long journey.',
  'Sarah sat down by the window. She sighed and closed her eyes.',
  'After a moment Sarah rose again. She had work to finish before dawn.',
].join('\n\n')

/** Every fixture keyed for iteration in cross-fixture invariants. */
export const ALL_FIXTURES: Record<string, string> = {
  DIALOGUE_HEAVY,
  CHAPTERED,
  MULTI_PROTAGONIST,
  MULTI_ANTAGONIST,
  LOW_DIALOGUE,
  ALIASES,
  PRONOUNS,
}
