package com.sudoku.validation;

import com.sudoku.model.Board;

import java.util.List;

/**
 * Composes all Sudoku {@link ValidationRule} strategies and applies them
 * together, either to a single candidate placement or to an entire board.
 */
public class BoardValidator {

    private final List<ValidationRule> rules = List.of(new RowRule(), new ColumnRule(), new BoxRule());

    public boolean isPlacementValid(Board board, int row, int col, int value) {
        return rules.stream().allMatch(rule -> rule.isSatisfied(board, row, col, value));
    }

    public boolean isBoardValid(Board board) {
        for (int row = 0; row < Board.SIZE; row++) {
            for (int col = 0; col < Board.SIZE; col++) {
                int value = board.getValue(row, col);
                if (value != 0 && !isPlacementValid(board, row, col, value)) {
                    return false;
                }
            }
        }
        return true;
    }
}
