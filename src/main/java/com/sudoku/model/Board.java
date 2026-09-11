package com.sudoku.model;

public class Board {

    public static final int SIZE = 9;
    public static final int BOX_SIZE = 3;

    private final Cell[][] cells;

    public Board() {
        cells = new Cell[SIZE][SIZE];
        for (int row = 0; row < SIZE; row++) {
            for (int col = 0; col < SIZE; col++) {
                cells[row][col] = new Cell();
            }
        }
    }

    public static Board fromGrid(int[][] grid) {
        Board board = new Board();
        for (int row = 0; row < SIZE; row++) {
            for (int col = 0; col < SIZE; col++) {
                board.setValue(row, col, grid[row][col]);
            }
        }
        return board;
    }

    public int getValue(int row, int col) {
        return cells[row][col].getValue();
    }

    public void setValue(int row, int col, int value) {
        cells[row][col].setValue(value);
    }

    public boolean isFull() {
        for (int row = 0; row < SIZE; row++) {
            for (int col = 0; col < SIZE; col++) {
                if (cells[row][col].isEmpty()) {
                    return false;
                }
            }
        }
        return true;
    }
}
