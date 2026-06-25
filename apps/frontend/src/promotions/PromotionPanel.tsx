import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { formatIstLocaleDateTime } from "../shared/ist-time";
import { PaginatedResponse, Section } from "../structure/structure-types";

type PromotionStudent = { id: string; rollNumber: string; fullName: string };
type PromotionPreview = {
  fromSection: { id: string; name: string; semesterNumber: number; branch: string; batch: string };
  toSection: { id: string; name: string; semesterNumber: number; branch: string; batch: string };
  students: PromotionStudent[];
  count: number;
};
type PromotionHistoryItem = {
  id: string;
  student: { rollNumber: string; fullName: string };
  fromSection: string;
  toSection: string;
  promotedBy: string;
  promotedAt: string;
  note?: string | null;
  promotionType?: string;
};

const inputClass = "db-input";

export function PromotionPanel() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [history, setHistory] = useState<PromotionHistoryItem[]>([]);
  const [fromSectionId, setFromSectionId] = useState("");
  const [toSectionId, setToSectionId] = useState("");
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const targetSections = useMemo(() => {
    if (!preview) return sections;
    return sections.filter((section) => section.id !== preview.fromSection.id);
  }, [preview, sections]);

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Promotion action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  async function load() {
    const [sectionPage, historyPage] = await Promise.all([
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100"),
      fetchJson<PaginatedResponse<PromotionHistoryItem>>("/api/promotions/history?pageSize=10")
    ]);
    setSections(sectionPage.items);
    setHistory(historyPage.items);
    setFromSectionId((current) => current || sectionPage.items[0]?.id || "");
    setToSectionId((current) => current || sectionPage.items[1]?.id || "");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load promotions", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function previewPromotion() {
    if (!fromSectionId || !toSectionId) return;
    const data = await fetchJson<PromotionPreview>(`/api/promotions/preview?fromSectionId=${encodeURIComponent(fromSectionId)}&toSectionId=${encodeURIComponent(toSectionId)}`);
    setPreview(data);
    setSelectedIds(data.students.map((student) => student.id));
    showToast(`Loaded ${data.count} eligible students`);
  }

  async function promote() {
    if (!preview || selectedIds.length === 0) {
      showToast("Preview and select students first", "error");
      return;
    }
    await sendJson("/api/promotions", { fromSectionId, toSectionId, studentProfileIds: selectedIds, note: note || undefined });
    setPreview(null);
    setSelectedIds([]);
    setNote("");
    await load();
    showToast("Students promoted successfully");
  }

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Promotion / Academic Year Change</h2>
          <p className="text-sm text-slate-500">Move students only to the next semester section and keep promotion history.</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Promotion data refreshed"))}>Refresh</SafeActionButton>
      </div>
      <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4">
        <Select value={fromSectionId} sections={sections} label="From section" onChange={setFromSectionId} />
        <Select value={toSectionId} sections={targetSections} label="To section" onChange={setToSectionId} />
        <input className={inputClass} placeholder="Note" value={note} onChange={(event) => setNote(event.target.value)} />
        <SafeActionButton run={previewPromotion}>Preview</SafeActionButton>
      </div>
      {preview ? (
        <div className="mt-4 rounded-xl border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">
              {preview.fromSection.branch} Sem {preview.fromSection.semesterNumber} {preview.fromSection.name} to Sem {preview.toSection.semesterNumber} {preview.toSection.name}
            </p>
            <SafeActionButton run={promote}>Promote Selected ({selectedIds.length})</SafeActionButton>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {preview.students.map((student) => (
              <label key={student.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggle(student.id)} />
                <span className="font-semibold">{student.rollNumber}</span>
                <span>{student.fullName}</span>
              </label>
            ))}
            {preview.students.length === 0 ? <p className="p-3 text-sm text-slate-500">No eligible students in source section.</p> : null}
          </div>
        </div>
      ) : null}
      <div className="mt-4 rounded-xl border p-4">
        <h3 className="text-sm font-bold uppercase text-slate-600">Recent Promotion History</h3>
        <div className="mt-2 grid gap-2">
          {history.map((item) => (
            <p key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <strong>{item.student.rollNumber}</strong> {item.student.fullName}: {item.fromSection} to {item.toSection}
              <span className="block text-xs text-slate-500">
                {item.promotionType ? `${item.promotionType} · ` : ""}
                By {item.promotedBy} on {formatIstLocaleDateTime(item.promotedAt)}
              </span>
            </p>
          ))}
          {history.length === 0 ? <p className="text-sm text-slate-500">No promotions recorded yet.</p> : null}
        </div>
      </div>
    </section>
  );
}

function Select({ value, sections, label, onChange }: { value: string; sections: Section[]; label: string; onChange: (value: string) => void }) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      placeholder={label}
      options={sections.map((section) => [section.id, `${section.name} - ${section.class?.label ?? section.classId}`])}
    />
  );
}
