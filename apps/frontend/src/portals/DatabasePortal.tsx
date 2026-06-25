import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { PageHeader } from "../shared/PageHeader";
import { PortalCard } from "../shared/PortalCard";
import { SafeActionButton } from "../shared/SafeActionButton";
import { useToast } from "../shared/toast-context";

type DatabaseTable = { key: string; label: string; columns: string[]; searchColumns: string[] };
type DatabaseRow = Record<string, unknown>;
type DatabaseRowsResponse = { table: DatabaseTable; items: DatabaseRow[]; total: number; page: number; pageSize: number };

const pageSize = 25;
const inputClass = "db-input";

export function DatabasePortal() {
  const { showToast } = useToast();
  const { authFetch } = useAuth();
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [rows, setRows] = useState<DatabaseRowsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const selectedTable = useMemo(() => tables.find((table) => table.key === selectedTableKey), [selectedTableKey, tables]);

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function loadTables() {
    const data = await fetchJson<{ tables: DatabaseTable[] }>("/api/database/tables");
    setTables(data.tables);
    const firstTable = data.tables[0]?.key ?? "";
    setSelectedTableKey((current) => current || firstTable);
    return firstTable;
  }

  async function loadRows(nextTableKey = selectedTableKey, nextPage = page, nextSearch = search) {
    if (!nextTableKey) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize), order: "desc" });
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      const data = await fetchJson<DatabaseRowsResponse>(`/api/database/tables/${nextTableKey}/rows?${params.toString()}`);
      setRows(data);
      setPage(data.page);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    async function bootstrap() {
      const firstTable = await loadTables();
      if (firstTable) await loadRows(firstTable, 1, "");
    }
    void bootstrap().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load database browser", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectTable(tableKey: string) {
    setSelectedTableKey(tableKey);
    setSearch("");
    await loadRows(tableKey, 1, "");
    showToast("Table loaded", "info");
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRows(selectedTableKey, 1, search);
  }

  const totalPages = rows ? Math.max(1, Math.ceil(rows.total / rows.pageSize)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Database portal"
        title="Admin-only data browser"
        description="Admin-only map of the active ERP data areas. This portal stays read-only-first so operational edits remain inside their modules."
      />
      <PortalCard title="Active ERP tables" description="Read-only browser for structure, users, finance, announcements, feedback, promotions, and audit data. Attendance, timetable, results, teams, and applications are managed in teacher/student portals.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tables.map((table) => (
            <button
              key={table.key}
              type="button"
              onClick={() => void selectTable(table.key).catch((error) => showToast(error instanceof Error ? error.message : "Unable to load table", "error"))}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium hover:border-blue-200 hover:bg-blue-50 ${selectedTableKey === table.key ? "border-blue-300 bg-blue-50 text-blue-800" : "bg-slate-50 text-slate-700"}`}
            >
              {table.label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          <SafeActionButton run={() => showToast("Database portal access checked")}>
            Check admin-only access
          </SafeActionButton>
        </div>
      </PortalCard>
      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{selectedTable?.label ?? "Select a table"}</h2>
            <p className="text-sm text-slate-500">
              {rows ? `${rows.total} records. Showing page ${rows.page} of ${totalPages}.` : "Choose a table to view rows."}
            </p>
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => void submitSearch(event).catch((error) => showToast(error instanceof Error ? error.message : "Search failed", "error"))}>
            <input className={inputClass} placeholder={`Search ${selectedTable?.searchColumns.join(", ") || "rows"}`} value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="erp-panel-submit">Search</button>
            <SafeActionButton run={() => loadRows(selectedTableKey, page, search).then(() => showToast("Rows refreshed"))}>Refresh</SafeActionButton>
          </form>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full divide-y text-sm">
            <thead className="bg-slate-50">
              <tr>
                {(rows?.table.columns ?? selectedTable?.columns ?? []).map((column) => (
                  <th key={column} className="whitespace-nowrap px-3 py-2 text-left font-bold text-slate-600">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {rows?.items.map((row, index) => (
                <tr key={String(row.id ?? index)} className="hover:bg-slate-50">
                  {rows.table.columns.map((column) => (
                    <td key={column} className="max-w-xs truncate px-3 py-2 text-slate-700" title={formatCell(row[column])}>
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
              {rows && rows.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={rows.table.columns.length}>No rows found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Limited to {pageSize} rows per page to keep the browser fast and stable.</p>
          <div className="flex gap-2">
            <SafeActionButton disabled={isLoading || page <= 1} run={() => loadRows(selectedTableKey, page - 1, search)}>Previous</SafeActionButton>
            <SafeActionButton disabled={isLoading || page >= totalPages} run={() => loadRows(selectedTableKey, page + 1, search)}>Next</SafeActionButton>
          </div>
        </div>
      </section>
    </>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
