package com.sudoku.validation;

import com.sudoku.model.Board;

public class RowRule implements ValidationRule {

    @Override
    public boolean isSatisfied(Board board, int row, int col, int value) {
        if (value == 0) {
            return true;
        }
        for (int c = 0; c < Board.SIZE; c++) {
            if (c != col && board.getValue(row, c) == value) {
                return false;
            }
        }
        return true;
    }
}
