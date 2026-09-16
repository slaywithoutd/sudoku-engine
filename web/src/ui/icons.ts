/**
 * Icons on a 24px grid, styled via the shared `.icon` class (currentColor
 * stroke). Sourced from lucide-static wherever a suitable icon exists;
 * "corner" and "center" have no library equivalent (they depict this app's
 * own note-position convention) and stay hand-drawn.
 */
import houseSvg from "lucide-static/icons/house.svg?raw";
import librarySvg from "lucide-static/icons/library.svg?raw";
import grid3x3Svg from "lucide-static/icons/grid-3x3.svg?raw";
import settingsSvg from "lucide-static/icons/settings.svg?raw";
import circleHelpSvg from "lucide-static/icons/circle-help.svg?raw";
import undoSvg from "lucide-static/icons/undo.svg?raw";
import redoSvg from "lucide-static/icons/redo.svg?raw";
import eraserSvg from "lucide-static/icons/eraser.svg?raw";
import pencilSvg from "lucide-static/icons/pencil.svg?raw";
import paletteSvg from "lucide-static/icons/palette.svg?raw";
import wandSvg from "lucide-static/icons/wand-2.svg?raw";
import playSvg from "lucide-static/icons/play.svg?raw";
import pauseSvg from "lucide-static/icons/pause.svg?raw";
import maximizeSvg from "lucide-static/icons/maximize.svg?raw";
import minimizeSvg from "lucide-static/icons/minimize.svg?raw";
import ellipsisSvg from "lucide-static/icons/ellipsis.svg?raw";
import copySvg from "lucide-static/icons/copy.svg?raw";
import clipboardPasteSvg from "lucide-static/icons/clipboard-paste.svg?raw";
import downloadSvg from "lucide-static/icons/download.svg?raw";
import uploadSvg from "lucide-static/icons/upload.svg?raw";
import imageSvg from "lucide-static/icons/image.svg?raw";
import keyboardSvg from "lucide-static/icons/keyboard.svg?raw";
import chevronDownSvg from "lucide-static/icons/chevron-down.svg?raw";
import chevronUpSvg from "lucide-static/icons/chevron-up.svg?raw";
import chevronLeftSvg from "lucide-static/icons/chevron-left.svg?raw";
import chevronRightSvg from "lucide-static/icons/chevron-right.svg?raw";
import checkSvg from "lucide-static/icons/check.svg?raw";
import xSvg from "lucide-static/icons/x.svg?raw";
import rotateCcwSvg from "lucide-static/icons/rotate-ccw.svg?raw";
import flagSvg from "lucide-static/icons/flag.svg?raw";
import squareSvg from "lucide-static/icons/square.svg?raw";
import skipBackSvg from "lucide-static/icons/skip-back.svg?raw";
import skipForwardSvg from "lucide-static/icons/skip-forward.svg?raw";
import saveSvg from "lucide-static/icons/save.svg?raw";
import fileSvg from "lucide-static/icons/file.svg?raw";
import eyeSvg from "lucide-static/icons/eye.svg?raw";
import sendSvg from "lucide-static/icons/send.svg?raw";
import usersSvg from "lucide-static/icons/users.svg?raw";

/** Custom, hand-drawn glyphs: no lucide icon depicts this app's own conventions. */
const CUSTOM = {
  corner: "M4 4h16v16H4zM7.5 7.5h.01M16.5 7.5h.01M7.5 16.5h.01M16.5 16.5h.01",
  center: "M4 4h16v16H4zM9 12h.01M12 12h.01M15 12h.01",
} as const;
const LUCIDE = {
  home: houseSvg,
  library: librarySvg,
  solve: grid3x3Svg,
  settings: settingsSvg,
  help: circleHelpSvg,
  undo: undoSvg,
  redo: redoSvg,
  erase: eraserSvg,
  pen: pencilSvg,
  palette: paletteSvg,
  wand: wandSvg,
  play: playSvg,
  pause: pauseSvg,
  expand: maximizeSvg,
  shrink: minimizeSvg,
  more: ellipsisSvg,
  copy: copySvg,
  paste: clipboardPasteSvg,
  download: downloadSvg,
  upload: uploadSvg,
  image: imageSvg,
  keypad: keyboardSvg,
  chevronDown: chevronDownSvg,
  chevronUp: chevronUpSvg,
  chevronLeft: chevronLeftSvg,
  chevronRight: chevronRightSvg,
  check: checkSvg,
  close: xSvg,
  reset: rotateCcwSvg,
  flag: flagSvg,
  stop: squareSvg,
  first: skipBackSvg,
  last: skipForwardSvg,
  save: saveSvg,
  file: fileSvg,
  eye: eyeSvg,
  send: sendSvg,
  users: usersSvg,
} as const;
export type IconName = keyof typeof CUSTOM | keyof typeof LUCIDE;

/** lucide-static ships a full `<svg ...>` document; keep only its inner shapes. */
function innerMarkup(source: string): string {
  return source.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
}
const MARKUP: Partial<Record<IconName, string>> = Object.fromEntries(
  Object.entries(LUCIDE).map(([name, source]) => [name, innerMarkup(source)]),
);

export function icon(name: IconName, label?: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("icon");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else svg.setAttribute("aria-hidden", "true");
  const custom = (CUSTOM as Record<string, string>)[name];
  if (custom) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", custom);
    svg.append(path);
  } else {
    // Markup is our own bundled dependency, not user input.
    svg.innerHTML = MARKUP[name] ?? "";
  }
  return svg;
}
