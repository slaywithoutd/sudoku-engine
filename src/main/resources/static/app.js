const SIZE = 9;

const boardEl = document.getElementById('board');
const modeHintEl = document.getElementById('modeHint');
const playBtn = document.getElementById('playBtn');
const notesBtn = document.getElementById('notesBtn');
const resetBtn = document.getElementById('resetBtn');
const newBoardBtn = document.getElementById('newBoardBtn');
const numpadEl = document.getElementById('numpad');
const popupOverlay = document.getElementById('popupOverlay');
const popupMessage = document.getElementById('popupMessage');
const popupCloseBtn = document.getElementById('popupCloseBtn');

function emptyNumberGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function emptyBoolGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
}

function emptyNotesGrid() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => new Set()));
}

let mode = 'create';
let grid = emptyNumberGrid();
let given = emptyBoolGrid();
let invalid = emptyBoolGrid();
let notes = emptyNotesGrid();
let selected = null;
let notesMode = false;
let flash = null;

async function validateCellApi(row, col, value) {
  const response = await fetch('/api/sudoku/validate-cell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: grid, row, col, value })
  });
  const data = await response.json();
  return data.valid;
}

async function validateBoardApi() {
  const response = await fetch('/api/sudoku/validate-board', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: grid })
  });
  return response.json();
}

async function refreshInvalidMask() {
  const tasks = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!given[r][c] && grid[r][c] !== 0) {
        tasks.push(
          validateCellApi(r, c, grid[r][c]).then((valid) => {
            invalid[r][c] = !valid;
          })
        );
      } else {
        invalid[r][c] = false;
      }
    }
  }
  await Promise.all(tasks);
  render();
}

function isBoardFull() {
  return grid.every((row) => row.every((value) => value !== 0));
}

async function checkCompletionAndPopup() {
  if (!isBoardFull()) return;
  const result = await validateBoardApi();
  if (result.valid && result.complete) {
    showPopup('Parabéns! Você concluiu o Sudoku corretamente.');
  } else {
    showPopup('O Sudoku está completo, mas ainda há erros. Confira as células destacadas em vermelho.');
  }
}

function showPopup(message) {
  popupMessage.textContent = message;
  popupOverlay.classList.remove('hidden');
}

function hidePopup() {
  popupOverlay.classList.add('hidden');
}

function flashInvalidCell(row, col) {
  flash = { row, col };
  render();
  setTimeout(() => {
    flash = null;
    render();
  }, 350);
}

function onCellClick(row, col) {
  if (mode === 'play' && given[row][col]) {
    return;
  }
  selected = { row, col };
  render();
}

async function handleDigit(num) {
  if (!selected) return;
  const { row, col } = selected;

  if (mode === 'create') {
    if (num === 0) {
      grid[row][col] = 0;
      render();
      return;
    }
    const valid = await validateCellApi(row, col, num);
    if (valid) {
      grid[row][col] = num;
      render();
    } else {
      flashInvalidCell(row, col);
    }
    return;
  }

  // play mode
  if (given[row][col]) return;

  if (num === 0) {
    grid[row][col] = 0;
    notes[row][col].clear();
    invalid[row][col] = false;
    render();
    return;
  }

  if (notesMode) {
    if (grid[row][col] !== 0) return;
    if (notes[row][col].has(num)) {
      notes[row][col].delete(num);
    } else {
      notes[row][col].add(num);
    }
    render();
    return;
  }

  grid[row][col] = num;
  notes[row][col].clear();
  await refreshInvalidMask();
  await checkCompletionAndPopup();
}

function updateControlsVisibility() {
  if (mode === 'create') {
    playBtn.classList.remove('hidden');
    notesBtn.classList.add('hidden');
    resetBtn.classList.add('hidden');
    newBoardBtn.classList.add('hidden');
    modeHintEl.textContent =
      'Modo criação: selecione uma célula e digite um número (1-9) para montar seu Sudoku. Jogadas que quebram as regras são bloqueadas.';
  } else {
    playBtn.classList.add('hidden');
    notesBtn.classList.remove('hidden');
    resetBtn.classList.remove('hidden');
    newBoardBtn.classList.remove('hidden');
    modeHintEl.textContent =
      'Modo jogo: células cinzas são as originais. Use "Anotações" para marcar candidatos nas células vazias.';
  }
}

function render() {
  boardEl.innerHTML = '';
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cellDiv = document.createElement('div');
      cellDiv.className = 'cell';

      if ((col + 1) % 3 === 0 && col !== SIZE - 1) cellDiv.classList.add('border-right');
      if ((row + 1) % 3 === 0 && row !== SIZE - 1) cellDiv.classList.add('border-bottom');

      if (given[row][col]) {
        cellDiv.classList.add('given');
      } else if (grid[row][col] !== 0) {
        cellDiv.classList.add('user-value');
      }

      if (invalid[row][col]) cellDiv.classList.add('invalid');
      if (flash && flash.row === row && flash.col === col) cellDiv.classList.add('invalid');

      if (selected && selected.row === row && selected.col === col) {
        cellDiv.classList.add('selected');
      } else if (selected && (selected.row === row || selected.col === col)) {
        cellDiv.classList.add('peer');
      }

      if (grid[row][col] !== 0) {
        cellDiv.textContent = grid[row][col];
      } else if (notes[row][col].size > 0) {
        const notesGrid = document.createElement('div');
        notesGrid.className = 'notes-grid';
        for (let n = 1; n <= 9; n++) {
          const span = document.createElement('span');
          span.textContent = notes[row][col].has(n) ? String(n) : '';
          notesGrid.appendChild(span);
        }
        cellDiv.appendChild(notesGrid);
      }

      cellDiv.addEventListener('click', () => onCellClick(row, col));
      boardEl.appendChild(cellDiv);
    }
  }
}

playBtn.addEventListener('click', () => {
  mode = 'play';
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      given[row][col] = grid[row][col] !== 0;
    }
  }
  selected = null;
  invalid = emptyBoolGrid();
  notes = emptyNotesGrid();
  notesMode = false;
  notesBtn.textContent = 'Anotações: Off';
  notesBtn.classList.remove('active');
  updateControlsVisibility();
  render();
});

resetBtn.addEventListener('click', () => {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!given[row][col]) {
        grid[row][col] = 0;
        notes[row][col].clear();
        invalid[row][col] = false;
      }
    }
  }
  render();
});

newBoardBtn.addEventListener('click', () => {
  mode = 'create';
  grid = emptyNumberGrid();
  given = emptyBoolGrid();
  invalid = emptyBoolGrid();
  notes = emptyNotesGrid();
  selected = null;
  notesMode = false;
  notesBtn.textContent = 'Anotações: Off';
  notesBtn.classList.remove('active');
  updateControlsVisibility();
  render();
});

notesBtn.addEventListener('click', () => {
  notesMode = !notesMode;
  notesBtn.textContent = 'Anotações: ' + (notesMode ? 'On' : 'Off');
  notesBtn.classList.toggle('active', notesMode);
});

numpadEl.addEventListener('click', (event) => {
  const button = event.target.closest('.num-btn');
  if (!button) return;
  handleDigit(Number(button.dataset.num));
});

popupCloseBtn.addEventListener('click', hidePopup);

document.addEventListener('keydown', (event) => {
  if (!selected) return;
  if (event.key >= '1' && event.key <= '9') {
    handleDigit(Number(event.key));
  } else if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') {
    handleDigit(0);
  }
});

updateControlsVisibility();
render();
