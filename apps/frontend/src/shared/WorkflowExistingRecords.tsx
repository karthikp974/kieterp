import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AdminWorkflowMenuButton } from "./OptionPage";
import { ProfileMenuButton } from "./ProfileMenu";
import { SearchableSelect } from "./SearchableSelect";
import { withEmptyOption } from "./select-options";

export type ExistingRecordsColumn = {
  header: string;
};

export type ExistingRecordsRow = {
  id: string;
  cells: ReactNode[];
};

type ExistingRecordsPanelProps = {
  title: string;
  total: number;
  isLoading?: boolean;
  emptyMessage?: string;
  search?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  campusId?: string;
  campusOptions?: [string, string][];
  onCampusChange?: (campusId: string) => void;
  columns: ExistingRecordsColumn[];
  rows: ExistingRecordsRow[];
};

/** Sub-page shell: back + title + profile menu (same as other admin drill-down pages). */
export function WorkflowExistingRecordsPageShell({ children, title }: { children: ReactNode; title: string }) {
  const navigate = useNavigate();

  return (
    <main className="db-workflow min-h-screen">
      <header className="db-workflow-header">
        <div className="db-header-left">
          <button className="db-icon-button" type="button" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton />
        </div>
      </header>
      <section className="db-workflow-body db-existing-records-page">{children}</section>
    </main>
  );
}

/** Module home shell helper — menu + title + profile. */
export function WorkflowModuleHomeShell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <main className="db-workflow min-h-screen">
      <header className="db-workflow-header">
        <div className="db-header-left">
          <AdminWorkflowMenuButton />
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton />
        </div>
      </header>
      <section className="db-workflow-body">{children}</section>
    </main>
  );
}

export function ExistingRecordsPageIntro({ description, title }: { title: string; description: string }) {
  return (
    <header className="db-existing-records-page-intro">
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

export function ExistingRecordsPanel({
  title,
  total,
  isLoading = false,
  emptyMessage = "No records.",
  search = "",
  searchPlaceholder = "Search code or name",
  onSearchChange,
  campusId = "",
  campusOptions,
  onCampusChange,
  columns,
  rows
}: ExistingRecordsPanelProps) {
  const showFilters = Boolean(onSearchChange || (campusOptions && onCampusChange));

  return (
    <article className="db-existing-records">
      <div className="db-existing-records-head">
        <div>
          <h3>{title}</h3>
          <p>{isLoading ? "Loading..." : `${total} record${total === 1 ? "" : "s"}`}</p>
        </div>
        {showFilters ? (
          <div className="db-existing-records-filters">
            {campusOptions && onCampusChange ? (
              <SearchableSelect
                value={campusId}
                onChange={onCampusChange}
                options={withEmptyOption(campusOptions, "All campuses")}
                placeholder="All campuses"
                searchable={false}
              />
            ) : null}
            {onSearchChange ? (
              <input
                className="db-input"
                value={search}
                placeholder={searchPlaceholder}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="admin-table-wrap db-existing-records-table">
        <table className="db-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.header}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length}>Loading records...</td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${index}`}>{cell}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>{emptyMessage}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="db-existing-records-cards" aria-label={`${title} mobile list`}>
        {isLoading ? <p className="db-existing-records-empty">Loading records...</p> : null}
        {!isLoading && rows.length === 0 ? <p className="db-existing-records-empty">{emptyMessage}</p> : null}
        {!isLoading
          ? rows.map((row) => (
              <article key={row.id} className="db-existing-record-card">
                {row.cells.map((cell, index) => (
                  <div key={`${row.id}-${index}`}>
                    <span>{columns[index]?.header}</span>
                    <strong>{cell}</strong>
                  </div>
                ))}
              </article>
            ))
          : null}
      </div>
    </article>
  );
}
