package com.sudoku.validation;

import com.sudoku.model.Board;

public class ColumnRule implements ValidationRule {

    @Override
    public boolean isSatisfied(Board board, int row, int col, int value) {
        if (value == 0) {
            return true;
        }
        for (int r = 0; r < Board.SIZE; r++) {
            if (r != row && board.getValue(r, col) == value) {
                return false;
            }
        }
        return true;
    }
}
