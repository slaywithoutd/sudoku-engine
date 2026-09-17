/**
 * Minecraft-style splash text for the home screen: one line picked at random
 * on every load. Mixes real quotes, jokes and small Sudoku facts. Keep new
 * entries short — this sits under the page title, not in a dialog.
 */
const SPLASHES: readonly string[] = [
  // Quotes
  "My secret vice is Sudoku puzzles. Can't stop playing them. My parents are accountants. I blame them entirely.",
  "There seem to be two main types of people in the world: crosswords and sudokus.",
  "Who knew we had all this O.C.D. in the world? It explains Sudoku, doesn't it?",
  "Being good at programming isn't that different from being good at solving Sudoku puzzles.",
  "Sudoku is a nice hobby, but it doesn't help you understand the world.",
  "A puzzle a day keeps overthinking at bay.",
  // Jokes
  "Nine digits, zero mercy.",
  "Still faster than filing your taxes.",
  "No calculator required. Ever.",
  "Achievement unlocked: used your brain today.",
  "Erasers sold separately.",
  "One does not simply guess in Sudoku.",
  "Row. Column. Box. Repeat.",
  "Beats doomscrolling.",
  "The 9×9 grid of destiny.",
  "Coffee not included.",
  "Warning: may cause spontaneous grid-staring.",
  "Nine numbers, infinite ways to get stuck.",
  // Small encouragements
  "Every empty cell is a question waiting for its answer.",
  "Logic always wins in the end.",
  "Small deductions, big victories.",
  "The answer was there all along.",
  "Patience is just logic with better manners.",
  "One cell at a time.",
  // Facts
  "“Sudoku” is short for a Japanese phrase meaning “the numbers must be single.”",
  "A valid Sudoku has exactly one solution.",
  "No published Sudoku needs fewer than 17 clues.",
  "Modern Sudoku was invented in Indiana, not Japan.",
  "There are over 6 sextillion possible solved grids.",
  "No arithmetic is required to solve a Sudoku — only logic.",
  "Sudoku became a worldwide craze in 2005.",
];
export function randomSplash(): string {
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
}
