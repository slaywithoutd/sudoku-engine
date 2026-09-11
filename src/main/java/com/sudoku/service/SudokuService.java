package com.sudoku.service;

import com.sudoku.dto.BoardValidationResponse;
import com.sudoku.model.Board;
import com.sudoku.validation.BoardValidator;
import org.springframework.stereotype.Service;

@Service
public class SudokuService {

    private final BoardValidator boardValidator = new BoardValidator();

    public boolean isPlacementValid(int[][] grid, int row, int col, int value) {
        Board board = Board.fromGrid(grid);
        return boardValidator.isPlacementValid(board, row, col, value);
    }

    public BoardValidationResponse checkBoard(int[][] grid) {
        Board board = Board.fromGrid(grid);
        boolean valid = boardValidator.isBoardValid(board);
        boolean complete = board.isFull();
        return new BoardValidationResponse(valid, complete);
    }
}
