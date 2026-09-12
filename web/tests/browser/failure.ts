import { mountApplication } from "../../src/app/application";
import { openRepository } from "../../src/storage/repository";
import "../../src/styles.css";
const repo = await openRepository(indexedDB, "sudoku-failure-test");
let fail = true;
document.querySelector("#allow")!.addEventListener("click", () => {
  fail = false;
});
let held = false;
const pending: (() => void)[] = [];
document.querySelector("#hold")!.addEventListener("click", () => {
  held = true;
});
document.querySelector("#release")!.addEventListener("click", () => {
  held = false;
  pending.splice(0).forEach((resolve) => resolve());
});
mountApplication(
  document.querySelector("#app")!,
  {
    ...repo,
    commit: async (d, r) => {
      if (fail) throw new Error("Simulated storage failure.");
      if (held) await new Promise<void>((resolve) => pending.push(resolve));
      return repo.commit(d, r);
    },
  },
  await repo.load(),
);
