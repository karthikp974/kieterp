import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import { ErpLoader } from "../shared/ErpLoader";

type OpsScope = "live" | "today" | "past";

type Summary = {
  liveCount: number;
  todayLogins: number;
  pastCount: number;
  liveWindowHours: number;
};

type BreakdownHour = {
  hour: number;
  label: string;
  count: number;
};

type BreakdownDay = {
  date: string;
  label: string;
  count: number;
  hours: BreakdownHour[];
};

type Breakdown = {
  metric: OpsScope;
  total: number;
  windowLabel: string;
  days: BreakdownDay[];
};

type SessionRow = {
  id: string;
  status: string;
  user: {
    fullName: string;
    type: string;
    rollNumber: string | null;
    employeeCode: string | null;
  };
  loginMethod: string;
  portal: string | null;
  currentPath: string | null;
  ipAddress: string | null;
  startedAt: string;
  lastSeenAt: string | null;
};

type SessionDetail = {
  session: SessionRow;
  events: { id: string; kind: string; portal: string | null; path: string; at: string }[];
};

type DateHourFilter = {
  date: string | null;
  hour: number | null;
};

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

function kindLabel(kind: string) {
  if (kind === "LOGIN") return "Signed in";
  if (kind === "HEARTBEAT") return "Active";
  return "Page";
}

function scopeTitle(scope: OpsScope) {
  if (scope === "live") return "Who was active (24h)";
  if (scope === "today") return "Today's logins";
  return "Past visitors";
}

function buildSessionsUrl(scope: OpsScope, filter: DateHourFilter) {
  const params = new URLSearchParams({ scope, page: "1", pageSize: "50" });
  if (filter.date) params.set("date", filter.date);
  if (filter.hour != null) params.set("hour", String(filter.hour));
  return `/api/ops/sessions?${params.toString()}`;
}

export function SpectatorDashboardPage() {
  const { authFetch, logout, user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scope, setScope] = useState<OpsScope>("live");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dateHourFilter, setDateHourFilter] = useState<DateHourFilter>({ date: null, hour: null });
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadBreakdown = useCallback(
    async (metric: OpsScope) => {
      setBreakdownLoading(true);
      try {
        const response = await authFetch(`/api/ops/breakdown?metric=${metric}`);
        if (!response.ok) throw new Error(await readApiError(response, "Unable to load breakdown."));
        setBreakdown((await response.json()) as Breakdown);
      } catch (loadError) {
        setBreakdown(null);
        setError(loadError instanceof Error ? loadError.message : "Unable to load breakdown.");
      } finally {
        setBreakdownLoading(false);
      }
    },
    [authFetch]
  );

  const load = useCallback(async () => {
    try {
      const [summaryRes, sessionsRes] = await Promise.all([
        authFetch("/api/ops/summary"),
        authFetch(buildSessionsUrl(scope, dateHourFilter))
      ]);
      if (!summaryRes.ok) throw new Error(await readApiError(summaryRes, "Unable to load summary."));
      if (!sessionsRes.ok) throw new Error(await readApiError(sessionsRes, "Unable to load sessions."));
      setSummary((await summaryRes.json()) as Summary);
      const sessionPayload = (await sessionsRes.json()) as { items: SessionRow[] };
      setSessions(sessionPayload.items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load spectator data.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, scope, dateHourFilter]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void loadBreakdown(scope);
  }, [scope, loadBreakdown]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    void authFetch(`/api/ops/sessions/${selectedId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, "Unable to load session detail."));
        const payload = (await response.json()) as SessionDetail;
        if (alive) setDetail(payload);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, selectedId]);

  function selectScope(nextScope: OpsScope) {
    setScope(nextScope);
    setExpandedDay(null);
    setDateHourFilter({ date: null, hour: null });
    setSelectedId(null);
  }

  function toggleDay(date: string) {
    setExpandedDay((current) => (current === date ? null : date));
    setDateHourFilter({ date, hour: null });
    setSelectedId(null);
  }

  function selectHour(date: string, hour: number) {
    setExpandedDay(date);
    setDateHourFilter({ date, hour });
    setSelectedId(null);
  }

  function clearBreakdownFilter() {
    setExpandedDay(null);
    setDateHourFilter({ date: null, hour: null });
    setSelectedId(null);
  }

  if (loading && !summary) {
    return <ErpLoader fullScreen />;
  }

  return (
    <main className="portal-no-footer ops-page">
      <div className="ops-shell">
        <header className="ops-header">
          <div>
            <p className="ops-eyebrow">Spectator console</p>
            <h1>Live campus activity</h1>
            <p className="ops-lead">Signed in as {user?.fullName}. Changes you make are recorded as admin.</p>
          </div>
          <div className="ops-header-actions">
            <Link to="/admin" className="db-wf-btn">
              Open admin ERP
            </Link>
            <button type="button" className="db-wf-btn db-wf-btn--primary" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>

        {error ? <p className="login-error">{error}</p> : null}

        <section className="ops-stats" aria-label="Activity summary">
          <button
            type="button"
            className={`ops-stat-card${scope === "live" ? " is-active" : ""}`}
            onClick={() => selectScope("live")}
          >
            <span className="ops-stat-value">{summary?.liveCount ?? 0}</span>
            <span className="ops-stat-label">Live now</span>
            <span className="ops-stat-hint">Last {summary?.liveWindowHours ?? 24} hours</span>
          </button>
          <button
            type="button"
            className={`ops-stat-card${scope === "today" ? " is-active" : ""}`}
            onClick={() => selectScope("today")}
          >
            <span className="ops-stat-value">{summary?.todayLogins ?? 0}</span>
            <span className="ops-stat-label">Logins today</span>
            <span className="ops-stat-hint">Tap for hour breakdown</span>
          </button>
          <button
            type="button"
            className={`ops-stat-card${scope === "past" ? " is-active" : ""}`}
            onClick={() => selectScope("past")}
          >
            <span className="ops-stat-value">{summary?.pastCount ?? 0}</span>
            <span className="ops-stat-label">Past visitors</span>
            <span className="ops-stat-hint">Last 30 days</span>
          </button>
        </section>

        <section className="ops-breakdown" aria-label="Activity breakdown">
          <div className="ops-section-head ops-breakdown-head">
            <div>
              <h2>Breakdown · {breakdown?.windowLabel ?? "Loading…"}</h2>
              <p className="ops-breakdown-meta">
                {breakdown?.total ?? 0} total
                {dateHourFilter.date
                  ? ` · filtered to ${dateHourFilter.date}${dateHourFilter.hour != null ? ` ${String(dateHourFilter.hour).padStart(2, "0")}:00 IST` : ""}`
                  : ""}
              </p>
            </div>
            {dateHourFilter.date ? (
              <button type="button" className="db-wf-btn" onClick={clearBreakdownFilter}>
                Clear filter
              </button>
            ) : null}
          </div>

          {breakdownLoading ? <ErpLoader /> : null}

          {!breakdownLoading && breakdown && breakdown.days.length === 0 ? (
            <p className="ops-breakdown-empty">No activity in this window yet.</p>
          ) : null}

          {!breakdownLoading && breakdown ? (
            <div className="ops-breakdown-days">
              {breakdown.days.map((day) => {
                const isExpanded = expandedDay === day.date;
                return (
                  <div key={day.date} className={`ops-breakdown-day${isExpanded ? " is-expanded" : ""}`}>
                    <button type="button" className="ops-breakdown-day-btn" onClick={() => toggleDay(day.date)}>
                      <span className="ops-breakdown-day-label">{day.label}</span>
                      <span className="ops-breakdown-day-count">{day.count}</span>
                    </button>
                    {isExpanded ? (
                      <ul className="ops-breakdown-hours">
                        {day.hours.map((hourRow) => (
                          <li key={`${day.date}-${hourRow.hour}`}>
                            <button
                              type="button"
                              className={`ops-breakdown-hour-btn${
                                dateHourFilter.date === day.date && dateHourFilter.hour === hourRow.hour ? " is-active" : ""
                              }`}
                              onClick={() => selectHour(day.date, hourRow.hour)}
                            >
                              <span>{hourRow.label}</span>
                              <strong>{hourRow.count}</strong>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="db-section ops-sessions">
          <div className="ops-section-head">
            <h2>{scopeTitle(scope)}</h2>
            <button type="button" className="db-wf-btn" onClick={() => void load()}>
              Refresh
            </button>
          </div>

          {sessions.length === 0 ? (
            <p className="db-muted">No sessions match this view.</p>
          ) : (
            <div className="ops-session-list">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`ops-session-card${selectedId === session.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(session.id)}
                >
                  <div className="ops-session-card-top">
                    <strong>{session.user.fullName}</strong>
                    <span className="ops-badge">{session.user.type.toLowerCase()}</span>
                    {scope === "live" ? <span className="ops-live-dot" aria-hidden /> : null}
                  </div>
                  <p className="ops-session-meta">{session.loginMethod}</p>
                  <p className="ops-session-meta">
                    Portal: {session.portal ?? "—"} · {session.currentPath ?? "No page yet"}
                  </p>
                  <p className="ops-session-meta">
                    Started {formatTime(session.startedAt)} · Last seen {formatTime(session.lastSeenAt)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedId ? (
          <section className="db-section ops-detail" aria-label="Session timeline">
            <div className="ops-section-head">
              <h2>Visitor timeline</h2>
              <button type="button" className="db-wf-btn" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
            {detailLoading ? <ErpLoader /> : null}
            {detail ? (
              <>
                <p className="ops-session-meta">
                  {detail.session.user.fullName} · {detail.session.loginMethod}
                </p>
                <ol className="ops-timeline">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <span className="ops-timeline-time">{formatTime(event.at)}</span>
                      <span className="ops-timeline-kind">{kindLabel(event.kind)}</span>
                      <span className="ops-timeline-path">
                        {event.portal ? `[${event.portal}] ` : ""}
                        {event.path}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
