import "./styles.css";
import { openRepository, type Repository } from "./storage/repository";
import { emptyLibrary } from "./domain/library";
import { mountApplication } from "./app/application";
import { el, button } from "./ui/dom";
const root = document.querySelector<HTMLElement>("#app")!;
async function boot(): Promise<void> {
  root.textContent = "Opening your library…";
  let repo: Repository | undefined;
  try {
    repo = await openRepository(indexedDB, "sudoku-engine", () => {
      root.textContent = "Close other tabs to finish opening your data.";
    });
    const data = await repo.load();
    mountApplication(root, repo, data);
  } catch (error) {
    repo?.close();
    root.replaceChildren(
      el("h1", "Could not open your data"),
      el("p", (error as Error).message),
      el(
        "p",
        "Try again, or continue in memory and export a backup. Your existing data will be preserved.",
      ),
    );
    root.append(
      button("Try opening again", () => {
        void boot();
      }),
      button("Continue without saving", () => {
        let recovered: Repository | undefined;
        const memoryRepo: Repository = {
          load: async () => emptyLibrary(),
          close: () => recovered?.close(),
          commit: async (data, revision) => {
            recovered ??= await openRepository();
            return recovered.commit(data, revision);
          },
        };
        mountApplication(root, memoryRepo, emptyLibrary(), error as Error);
      }),
    );
  }
}
void boot();
