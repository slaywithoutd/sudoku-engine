package com.sudoku.validation;

import com.sudoku.model.Board;

public class BoxRule implements ValidationRule {

    @Override
    public boolean isSatisfied(Board board, int row, int col, int value) {
        if (value == 0) {
            return true;
        }
        int boxRow = (row / Board.BOX_SIZE) * Board.BOX_SIZE;
        int boxCol = (col / Board.BOX_SIZE) * Board.BOX_SIZE;
        for (int r = boxRow; r < boxRow + Board.BOX_SIZE; r++) {
            for (int c = boxCol; c < boxCol + Board.BOX_SIZE; c++) {
                if ((r != row || c != col) && board.getValue(r, c) == value) {
                    return false;
                }
            }
        }
        return true;
    }
}
