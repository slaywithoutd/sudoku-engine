import type { ScreenServices } from "../app/controller";
import { exportBackup } from "../domain/backup";
import { el } from "./dom";
export function downloadBackup(services: ScreenServices): void {
  const text = exportBackup(services.controller.snapshot(), services.now()),
    url = URL.createObjectURL(new Blob([text], { type: "application/json" })),
    link = el("a");
  link.href = url;
  link.download = `sudoku-backup-${services.now().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
