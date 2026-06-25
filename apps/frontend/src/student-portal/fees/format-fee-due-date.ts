/** Display API date (yyyy-mm-dd) as dd-mm-yyyy for fee tables. */
export function formatFeeDueDate(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const [year, month, day] = value.trim().split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}
