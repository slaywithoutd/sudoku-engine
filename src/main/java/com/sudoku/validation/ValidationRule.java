package com.sudoku.validation;

import com.sudoku.model.Board;

/**
 * Strategy interface: each implementation checks a single Sudoku constraint
 * (row, column or box) for a candidate value at a given position.
 */
public interface ValidationRule {

    boolean isSatisfied(Board board, int row, int col, int value);
}
