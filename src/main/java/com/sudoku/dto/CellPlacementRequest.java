package com.sudoku.dto;

public record CellPlacementRequest(int[][] board, int row, int col, int value) {
}
