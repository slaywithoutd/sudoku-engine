/**
 * Validates a completed classic Sudoku without sharing production topology or
 * mask code. Keeping this as plain loops gives oracle witnesses a second,
 * structurally different acceptance check.
 */
export function checkGrid(givens: number[], values: number[]): boolean {
  if (givens.length !== 81 || values.length !== 81) return false;

  for (let cell = 0; cell < 81; cell += 1) {
    const given = givens[cell];
    const value = values[cell];
    if (!Number.isInteger(given) || given < 0 || given > 9) return false;
    if (!Number.isInteger(value) || value < 1 || value > 9) return false;
    if (given !== 0 && given !== value) return false;
  }

  for (let row = 0; row < 9; row += 1) {
    const seen = Array<boolean>(10).fill(false);
    for (let column = 0; column < 9; column += 1) {
      const value = values[row * 9 + column];
      if (seen[value]) return false;
      seen[value] = true;
    }
  }

  for (let column = 0; column < 9; column += 1) {
    const seen = Array<boolean>(10).fill(false);
    for (let row = 0; row < 9; row += 1) {
      const value = values[row * 9 + column];
      if (seen[value]) return false;
      seen[value] = true;
    }
  }

  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
      const seen = Array<boolean>(10).fill(false);
      for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < 3; columnOffset += 1) {
          const row = boxRow * 3 + rowOffset;
          const column = boxColumn * 3 + columnOffset;
          const value = values[row * 9 + column];
          if (seen[value]) return false;
          seen[value] = true;
        }
      }
    }
  }

  return true;
}
