/** Append strict campus filter params for admin existing-records catalog pages. */
export function appendOwnedCampusFilter(params: URLSearchParams, campusId?: string) {
  if (!campusId) return;
  params.set("campusId", campusId);
  params.set("campusScope", "owned");
}

export const EXISTING_RECORDS_EMPTY_MESSAGE = "No records.";
