package com.sudoku.model;

public class Cell {

    private int value;

    public Cell() {
        this(0);
    }

    public Cell(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public void setValue(int value) {
        this.value = value;
    }

    public boolean isEmpty() {
        return value == 0;
    }
}
