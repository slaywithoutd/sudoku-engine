package com.sudoku.controller;

import com.sudoku.dto.BoardRequest;
import com.sudoku.dto.BoardValidationResponse;
import com.sudoku.dto.CellPlacementRequest;
import com.sudoku.dto.CellValidationResponse;
import com.sudoku.service.SudokuService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sudoku")
public class SudokuController {

    private final SudokuService sudokuService;

    public SudokuController(SudokuService sudokuService) {
        this.sudokuService = sudokuService;
    }

    @PostMapping("/validate-cell")
    public CellValidationResponse validateCell(@RequestBody CellPlacementRequest request) {
        boolean valid = sudokuService.isPlacementValid(request.board(), request.row(), request.col(), request.value());
        return new CellValidationResponse(valid);
    }

    @PostMapping("/validate-board")
    public BoardValidationResponse validateBoard(@RequestBody BoardRequest request) {
        return sudokuService.checkBoard(request.board());
    }
}
