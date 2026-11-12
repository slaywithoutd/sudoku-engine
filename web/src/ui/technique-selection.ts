import type { Settings } from "../domain/model";
import { CUSTOM_TECHNIQUE_SET } from "../domain/settings";
import {
  compareIds,
  DEFAULT_TECHNIQUE_PRESET,
  profileRowIds,
  resolveTechniqueSet,
  TECHNIQUE_PRESETS,
  type TechniqueSelection,
} from "../solver/techniques/technique-sets";
import { techniqueSetLine } from "./solver-copy";

/**
 * The Solve screen's technique set (M2.7, D105), free of DOM code so the
 * request shape and the custom-set edits are unit-tested.
 */
type TechniqueSettings = Pick<Settings, "solverTechniquePreset" | "solverTechniquesOff">;

/** The families the Solve screen offers: the classic profile's rows. */
export const SELECTABLE_IDS: readonly string[] = profileRowIds("classic-expanded@1");

/**
 * The run's technique selection: nothing for "All", so a default run sends
 * the same request as before; the stored switched-off ids for "Custom".
 */
export function techniqueSelectionOf(settings: TechniqueSettings): TechniqueSelection | undefined {
  if (settings.solverTechniquePreset === CUSTOM_TECHNIQUE_SET)
    return { off: [...settings.solverTechniquesOff] };
  return settings.solverTechniquePreset === DEFAULT_TECHNIQUE_PRESET
    ? undefined
    : { preset: settings.solverTechniquePreset };
}

/** "Techniques: No fish (28 of 33)" for a set of settings. */
export function techniqueSetText(settings: TechniqueSettings): string {
  const enabled =
    resolveTechniqueSet("classic-expanded@1", techniqueSelectionOf(settings)) ?? SELECTABLE_IDS;
  const label =
    settings.solverTechniquePreset === CUSTOM_TECHNIQUE_SET
      ? "Custom"
      : (TECHNIQUE_PRESETS.find((preset) => preset.id === settings.solverTechniquePreset)?.label ??
        settings.solverTechniquePreset);
  return techniqueSetLine(label, enabled.length, SELECTABLE_IDS.length);
}

/** The stored list, sorted and without duplicates, as settings require. */
const canonical = (off: Iterable<string>): string[] => [...new Set(off)].sort(compareIds);

/**
 * The custom set after switching one family on or off. Ids the screen does
 * not show (U and K rows) are kept, never dropped.
 */
export function switchTechnique(stored: readonly string[], id: string, on: boolean): string[] {
  const off = new Set(stored);
  if (on) off.delete(id);
  else off.add(id);
  return canonical(off);
}

/** The custom set with every shown family on, or every shown family off; hidden ids are kept. */
export function switchAllTechniques(stored: readonly string[], on: boolean): string[] {
  const shown = new Set(SELECTABLE_IDS);
  const hidden = stored.filter((id) => !shown.has(id));
  return canonical(on ? hidden : [...hidden, ...SELECTABLE_IDS]);
}
