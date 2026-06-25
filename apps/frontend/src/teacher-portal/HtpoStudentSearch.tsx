import { useMemo, useState } from "react";

type StudentOption = {
  studentProfileId: string;
  rollNumber: string;
  fullName: string;
};

export function HtpoStudentSearch({
  students,
  value,
  onChange
}: {
  students: StudentOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const query = value.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!query) return [];
    return students
      .filter(
        (row) =>
          row.fullName.toLowerCase().includes(query) || row.rollNumber.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [query, students]);

  const showSuggestions = focused && query.length > 0 && suggestions.length > 0;

  return (
    <div className="htpo-student-search">
      <input
        className="db-input htpo-student-search__input"
        type="search"
        placeholder="Search by name or roll number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        aria-label="Search students"
        autoComplete="off"
      />
      {showSuggestions ? (
        <ul className="htpo-student-search__suggestions" role="listbox">
          {suggestions.map((row) => (
            <li key={row.studentProfileId}>
              <button
                type="button"
                className="htpo-student-search__option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(row.fullName);
                  setFocused(false);
                }}
              >
                <span className="htpo-student-search__name">{row.fullName}</span>
                <span className="htpo-student-search__roll">{row.rollNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
