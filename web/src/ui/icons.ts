/** Stroke icons on a 24px grid; decorative unless a label is supplied. */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5.5 9v11.5h5v-6h3v6h5V9",
  library: "M5 4h4v16H5zM10.5 4h4v16h-4zM16 5.2l3.4-.9 3.1 15.4-3.4.9z",
  solve: "M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16",
  settings:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 13.5l1.6 1.2-1.9 3.3-1.9-.7a7.6 7.6 0 0 1-1.9 1.1l-.3 2h-3.8l-.3-2a7.6 7.6 0 0 1-1.9-1.1l-1.9.7L3 14.7l1.6-1.2a7.7 7.7 0 0 1 0-3L3 9.3 5 6l1.9.7A7.6 7.6 0 0 1 8.8 5.6l.3-2h3.8l.3 2a7.6 7.6 0 0 1 1.9 1.1L17.1 6 19 9.3l-1.6 1.2a7.7 7.7 0 0 1 0 3Z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 3.8M12 17.2h.01",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  erase: "M20 20H9L4.3 15.3a1 1 0 0 1 0-1.4L13.6 4.6a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4L12 19M8.5 10.5l6 6",
  pen: "M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3M14.5 7.5l2 2",
  corner: "M4 4h16v16H4zM7.5 7.5h.01M16.5 7.5h.01M7.5 16.5h.01M16.5 16.5h.01",
  center: "M4 4h16v16H4zM9 12h.01M12 12h.01M15 12h.01",
  palette:
    "M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a1.8 1.8 0 0 0-1.3 3.1c.8.9.2 2.4-1.7 2.4ZM7.5 11h.01M10 7h.01M14.5 7h.01M17 11h.01",
  wand: "m4 20 11-11M13 7l4 4M17 3v3M15.5 4.5h3M20 8v2M19 9h2M9 3v2M8 4h2",
  play: "M7 4.5v15l12.5-7.5z",
  pause: "M8 5v14M16 5v14",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  paste: "M9 4h6v3H9zM15 5h3v15H6V5h3M9 12h6M9 16h4",
  download: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14",
  upload: "M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5h.01",
  keypad: "M5 4h4v4H5zM10 4h4v4h-4zM15 4h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 16h4v4H5zM10 16h4v4h-4zM15 16h4v4h-4z",
  chevronDown: "m6 9 6 6 6-6",
  chevronUp: "m6 15 6-6 6 6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronRight: "m9 6 6 6-6 6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6 6 18",
  reset: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  flag: "M5 21V4h11l-2 4 2 4H5",
  stop: "M6 6h12v12H6z",
  first: "M18 6l-6 6 6 6M7 6v12",
  last: "M6 6l6 6-6 6M17 6v12",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  eye: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  send: "M5 12h13M13 6l6 6-6 6",
} as const;
export type IconName = keyof typeof PATHS;
export function icon(name: IconName, label?: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("icon");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}
