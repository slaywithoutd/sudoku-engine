import "./styles.css";
import { openRepository, type Repository } from "./storage/repository";
import { emptyLibrary } from "./domain/library";
import { mountApplication } from "./app/application";
import { el, button } from "./ui/dom";
const root = document.querySelector<HTMLElement>("#app")!;
async function boot(): Promise<void> {
  root.textContent = "Abrindo sua biblioteca…";
  let repo: Repository | undefined;
  try {
    repo = await openRepository(indexedDB, "sudoku-engine", () => {
      root.textContent =
        "Feche outras abas para concluir a abertura dos dados.";
    });
    const data = await repo.load();
    mountApplication(root, repo, data);
  } catch (error) {
    repo?.close();
    root.replaceChildren(
      el("h1", "Não foi possível abrir seus dados"),
      el("p", (error as Error).message),
      el(
        "p",
        "Você pode tentar novamente ou trabalhar em memória e exportar um backup. Os dados existentes serão preservados.",
      ),
    );
    root.append(
      button("Tentar abrir novamente", () => {
        void boot();
      }),
      button("Continuar sem salvar", () => {
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
