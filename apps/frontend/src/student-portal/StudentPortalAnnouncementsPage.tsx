import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { StudentAnnouncementCard } from "./announcements/StudentAnnouncementCard";
import { StudentAnnouncementDetailModal } from "./announcements/StudentAnnouncementDetailModal";
import { StudentPortalAnnouncementsSkeleton } from "./announcements/StudentPortalAnnouncementsSkeleton";
import type {
  StudentAnnouncementDetailResponse,
  StudentAnnouncementListItem,
  StudentAnnouncementsListResponse
} from "./announcements/student-announcements-types";
import { dispatchStudentNotificationsRefresh } from "./student-portal-notification-events";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalAnnouncementsPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<StudentAnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<(StudentAnnouncementListItem & { body: string }) | null>(null);

  const openFromQuery = searchParams.get("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (search.trim()) params.set("search", search.trim());
      const res = await authFetch(`/api/portals/student/engage/announcements?${params.toString()}`);
      if (!res.ok) throw await readError(res);
      const data = (await res.json()) as StudentAnnouncementsListResponse;
      setItems(data.items);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load announcements.", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, search, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(
    async (id: string) => {
      setDetailId(id);
      setDetailLoading(true);
      setDetail(null);
      try {
        const res = await authFetch(`/api/portals/student/engage/announcements/${encodeURIComponent(id)}`);
        if (!res.ok) throw await readError(res);
        const data = (await res.json()) as StudentAnnouncementDetailResponse;
        setDetail(data.announcement);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load announcement.", "error");
        setDetailId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [authFetch, showToast]
  );

  useEffect(() => {
    if (openFromQuery && !loading) {
      void openDetail(openFromQuery);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("open");
        return next;
      });
    }
  }, [loading, openFromQuery, openDetail, setSearchParams]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const ta = new Date(a.publishedAt ?? a.createdAt).getTime();
      const tb = new Date(b.publishedAt ?? b.createdAt).getTime();
      return tb - ta;
    });
  }, [items]);

  const handleMarkedRead = useCallback((id: string) => {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)));
    setDetail((prev) => (prev && prev.id === id ? { ...prev, readAt: new Date().toISOString() } : prev));
    dispatchStudentNotificationsRefresh();
  }, []);

  if (loading && items.length === 0) {
    return <StudentPortalAnnouncementsSkeleton />;
  }

  return (
    <div className="sp-ann">
      <header className="sp-ann-head">
        <p className="sp-ann-page-sub">Notices for your campus, class, and section.</p>
        <div className="sp-ann-search-row">
          <input
            className="sp-ann-search"
            type="search"
            placeholder="Search announcements"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <button type="button" className="sp-ann-search-btn" onClick={() => void load()}>
            Search
          </button>
        </div>
      </header>

      {sortedItems.length === 0 ? (
        <p className="sp-ann-empty">No announcements for your scope right now.</p>
      ) : (
        <div className="sp-ann-grid">
          {sortedItems.map((item) => (
            <StudentAnnouncementCard
              key={item.id}
              item={item}
              onOpen={(id) => {
                void openDetail(id);
              }}
            />
          ))}
        </div>
      )}

      <StudentAnnouncementDetailModal
        open={detailId !== null}
        loading={detailLoading}
        announcement={detail}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
        onMarkedRead={() => {
          if (detailId) handleMarkedRead(detailId);
        }}
      />
    </div>
  );
}
