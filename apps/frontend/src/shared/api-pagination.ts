/** Matches backend `PaginationDto` @Max(100) — never exceed for list/catalog fetches. */
export const API_MAX_PAGE_SIZE = 100;

export function apiPageSizeParam(pageSize = API_MAX_PAGE_SIZE) {
  return String(pageSize);
}
