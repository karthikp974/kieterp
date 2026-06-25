import { ArrowLeft, Search } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton } from "./OptionPage";
import { ProfileMenuButton } from "./ProfileMenu";
import { formatIstLocaleDateTime } from "./ist-time";

type AuditUser = { id: string; fullName: string; email: string };
type AuditLogItem = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: unknown;
  createdAt: string;
  user?: AuditUser | null;
};
type PageResponse<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ModuleHistoryConfig = {
  title: string;
  entities: string[];
};

export function ModuleHistoryPage({ entities }: ModuleHistoryConfig) {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;
  const canGoNext = page * pageSize < total;

  const entityParam = useMemo(() => entities.join(","), [entities]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), entities: entityParam });
    if (query.trim()) params.set("search", query.trim());
    setIsLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/audit-logs?${params}`);
      if (!response.ok) throw await responseError(response);
      const payload = (await response.json()) as PageResponse<AuditLogItem>;
      setItems(payload.items);
      setTotal(payload.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load history.");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, entityParam, page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    void load();
  }

  return (
    <main className="db-workflow min-h-screen">
      <header className="db-workflow-header">
        <div className="db-header-left">
          <button className="db-icon-button" type="button" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
          <h1>History</h1>
        </div>
        <div className="db-header-actions">
          <AdminWorkflowMenuButton />
          <ProfileMenuButton />
        </div>
      </header>
      <section className="db-workflow-body">
        <form className="db-search-bar" onSubmit={(event) => search(event)}>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recent activity" />
          <button>Search</button>
        </form>

        <section className="db-section">
          <h2>Recent Activity</h2>
          <div className="db-card db-form">
            {isLoading ? <EmptyText>Loading history...</EmptyText> : null}
            {error ? <EmptyText>{error}</EmptyText> : null}
            {!isLoading && !error && !items.length ? <EmptyText>No recent activity yet.</EmptyText> : null}
            {!isLoading && !error && items.length ? (
              <div className="db-history-list">
                {items.map((item) => <HistoryRow item={item} key={item.id} />)}
              </div>
            ) : null}
            <div className="db-history-pagination">
              <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span>Page {page}</span>
              <button type="button" disabled={!canGoNext || isLoading} onClick={() => setPage((current) => current + 1)}>Next</button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function HistoryRow({ item }: { item: AuditLogItem }) {
  return (
    <article className="db-history-row">
      <div>
        <strong>{formatAction(item.action)}</strong>
        <span>{item.entity}{item.entityId ? ` • ${item.entityId}` : ""}</span>
      </div>
      <p>{formatMetadata(item.metadata)}</p>
      <small>{item.user?.fullName ?? "System"} • {formatIstLocaleDateTime(item.createdAt)}</small>
    </article>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function formatAction(action: string) {
  return action.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "No extra details.";
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (!entries.length) return "No extra details.";
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" • ");
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}
