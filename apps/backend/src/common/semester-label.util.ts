/** Academic label e.g. semester 3 → "2.1" (year.part). */
export function formatSemesterLabel(semesterNumber: number) {
  const year = Math.floor((semesterNumber - 1) / 2) + 1;
  const part = ((semesterNumber - 1) % 2) + 1;
  return `${year}.${part}`;
}

/** Linear semester index → academic year (sem 1–2 → year 1, sem 3–4 → year 2, …). */
export function yearNumberFromSemester(semesterNumber: number) {
  return Math.ceil(semesterNumber / 2);
}

/** Human label e.g. 1 → "1st Year", 2 → "2nd Year". */
export function formatAcademicYearLabel(yearNumber: number) {
  const mod100 = yearNumber % 100;
  const mod10 = yearNumber % 10;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? "st"
      : mod10 === 2 && mod100 !== 12
        ? "nd"
        : mod10 === 3 && mod100 !== 13
          ? "rd"
          : "th";
  return `${yearNumber}${suffix} Year`;
}
