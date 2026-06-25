import type { FormSelectOption } from "./FormSelect";
import type { SearchableSelectOption } from "./SearchableSelect";

type TupleOption = [string, string];
export type SelectOptionInput = SearchableSelectOption | TupleOption;

/** Prepend "All / none" row so filters can clear and placeholders match a real option. */
export function withEmptyOption(options: readonly SelectOptionInput[], label = "All"): SelectOptionInput[] {
  return [["", label], ...options];
}

export function toFormSelectOptions(options: readonly SelectOptionInput[]): FormSelectOption[] {
  return options.map((o) => (Array.isArray(o) ? ([o[0], o[1]] as const) : ([o.value, o.label] as const)));
}
