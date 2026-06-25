import { ArrowLeft, Banknote, History } from "lucide-react";
import { FormEvent, InputHTMLAttributes, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { safeRandomId } from "../shared/safe-random-id";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import { useToast } from "../shared/toast-context";
import { formatIstLocaleDateTime } from "../shared/ist-time";
import { Batch, Branch, Campus, PaginatedResponse, Program } from "../structure/structure-types";

const PAYMENT_MODES: [string, string][] = [
  ["CASH", "Cash"],
  ["CARD", "Card"],
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank Transfer"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"]
];

type RollHit = {
  id: string;
  rollNumber: string;
  fullName: string;
  sectionId: string;
  sectionName: string;
  classLabel: string;
  semesterNumber: number;
};

type PayableLine = {
  kind: "ASSIGNMENT";
  studentFeeAssignmentId: string;
  feeDisplayName: string;
  totalDue: number;
  paidAmount: number;
  balance: number;
  percentagePaid: number;
  paymentStatusWord: string;
};

type PreviewResult = {
  feeDisplayName?: string | null;
  amount: number;
  totalDue: number | null;
  paidBefore: number | null;
  paidAfter: number | null;
  remainingAfter: number | null;
  percentagePaid: number | null;
  paymentStatusWord: string;
};

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function PaymentsShell({
  children,
  title,
  variant = "subpage",
  backHref
}: {
  children: ReactNode;
  title: string;
  variant?: "main" | "subpage";
  backHref?: string;
}) {
  const navigate = useNavigate();
  return (
    <main className="db-workflow ann-workflow min-h-screen promotion-workflow-layout">
      <header className="db-workflow-header">
        <div className="db-header-left">
          {variant === "main" ? (
            <AdminWorkflowMenuButton />
          ) : backHref ? (
            <Link to={backHref} className="db-icon-button" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <button type="button" className="db-icon-button" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton />
        </div>
      </header>
      <div className="db-workflow-body ann-workflow-body promotion-body">{children}</div>
    </main>
  );
}

function PlainSelect({ onChange, options, placeholder, value, disabled }: { value: string; onChange: (value: string) => void; options: [string, string][]; placeholder: string; disabled?: boolean }) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchable={false}
      clearable={false}
      disabled={disabled}
    />
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Input({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) {
  return <input className="db-input" {...props} onChange={(event) => onChange(event.target.value)} />;
}

export function PaymentsHubPage() {
  const navigate = useNavigate();
  return (
    <PaymentsShell title="Payments" variant="main">
      <WorkflowSection title="Fee payments">
        <OptionActionButton
          icon={Banknote}
          description="Choose batch and student by roll number, enter amount, then register the receipt."
          onClick={() => navigate("/payments/register")}
        >
          Register fee
        </OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <OptionActionButton
          icon={History}
          description="Browse past receipts with filters and pagination."
          onClick={() => navigate("/payments/history")}
        >
          Payment history
        </OptionActionButton>
      </WorkflowSection>
    </PaymentsShell>
  );
}

export function PaymentsRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const backHref = (location.state as { backHref?: string } | null)?.backHref ?? "/payments";
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [campusId, setCampusId] = useState("");
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [batchId, setBatchId] = useState("");

  const [rollInput, setRollInput] = useState("");
  const [rollHits, setRollHits] = useState<RollHit[]>([]);
  const [rollLoading, setRollLoading] = useState(false);
  const rollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [studentProfileId, setStudentProfileId] = useState("");
  const [context, setContext] = useState<{
    student: {
      id: string;
      fullName: string;
      rollNumber: string;
      campus: { code: string; name: string };
      department: { code: string; name: string };
      branch: { code: string; name: string };
      class: { label: string; semesterNumber: number };
      section: { name: string };
    };
    payableFees: PayableLine[];
  } | null>(null);

  const [payableLines, setPayableLines] = useState<PayableLine[]>([]);
  const [feeLineChoice, setFeeLineChoice] = useState("");
  const [otherFeeName, setOtherFeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [remarks, setRemarks] = useState("");

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => safeRandomId("pay"));

  const fetchJson = useCallback(
    async <T,>(path: string) => {
      const response = await authFetch(path);
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as T;
    },
    [authFetch]
  );

  const sendJson = useCallback(
    async <T,>(path: string, body: unknown) => {
      const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as T;
    },
    [authFetch]
  );

  useEffect(() => {
    void (async () => {
      try {
        const [campusPage, programPage, branchPage, batchPage] = await Promise.all([
          fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
          fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
          fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
          fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100")
        ]);
        setCampuses(campusPage.items);
        setPrograms(programPage.items);
        setBranches(branchPage.items);
        setBatches(batchPage.items);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load catalogs", "error");
      }
    })();
  }, [fetchJson, showToast]);

  const programOptions = useMemo(
    () => programsForOperationalCampus(programs, campusId, campuses).map((p) => [p.id, `${p.code} — ${p.name}`] as [string, string]),
    [campusId, campuses, programs]
  );
  const branchOptions = useMemo(() => branches.filter((b) => b.programId === programId).map((b) => [b.id, `${b.code} — ${b.name}`] as [string, string]), [branches, programId]);
  const batchOptions = useMemo(() => batches.filter((b) => b.branchId === branchId).map((b) => [b.id, `${b.startYear}–${b.endYear}`] as [string, string]), [batches, branchId]);

  function resetHierarchy(from: "campus" | "program" | "branch" | "batch") {
    if (from === "campus") {
      setProgramId("");
      setBranchId("");
      setBatchId("");
    }
    if (from === "program" || from === "campus") {
      setBranchId("");
      setBatchId("");
    }
    if (from === "branch" || from === "program" || from === "campus") setBatchId("");
    setStudentProfileId("");
    setContext(null);
    setPayableLines([]);
    setRollHits([]);
    setRollInput("");
    setFeeLineChoice("");
    setOtherFeeName("");
    setAmount("");
    setPreview(null);
    setStep(1);
  }

  useEffect(() => {
    if (!batchId || rollInput.trim().length < 1) {
      setRollHits([]);
      return;
    }
    if (rollDebounceRef.current) clearTimeout(rollDebounceRef.current);
    rollDebounceRef.current = setTimeout(() => {
      rollDebounceRef.current = null;
      void (async () => {
        setRollLoading(true);
        try {
          const params = new URLSearchParams({ batchId, q: rollInput.trim() });
          const data = await fetchJson<{ items: RollHit[] }>(`/api/payments/students/search-by-roll?${params.toString()}`);
          setRollHits(data.items);
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Roll search failed", "error");
          setRollHits([]);
        } finally {
          setRollLoading(false);
        }
      })();
    }, 320);
    return () => {
      if (rollDebounceRef.current) clearTimeout(rollDebounceRef.current);
    };
  }, [batchId, fetchJson, rollInput, showToast]);

  async function pickStudent(hit: RollHit) {
    setStudentProfileId(hit.id);
    setRollInput(hit.rollNumber);
    setRollHits([]);
    try {
      const ctx = await fetchJson<{
        student: {
          id: string;
          fullName: string;
          rollNumber: string;
          campus: { code: string; name: string };
          department: { code: string; name: string };
          branch: { code: string; name: string };
          class: { label: string; semesterNumber: number };
          section: { name: string };
        };
        payableFees: PayableLine[];
      }>(`/api/payments/students/${hit.id}/context?batchId=${encodeURIComponent(batchId)}`);
      setContext(ctx);
      setPayableLines(ctx.payableFees);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load student", "error");
      setStudentProfileId("");
      setContext(null);
    }
  }

  const feeLineOptions = useMemo((): [string, string][] => {
    const rows = payableLines.map((line) => [line.studentFeeAssignmentId, `${line.feeDisplayName} (balance ${line.balance})`] as [string, string]);
    return [...rows, ["OTHER", "Other (specify)"]];
  }, [payableLines]);

  const step1Ok = Boolean(batchId && studentProfileId && context);
  const step2Ok = Boolean(
    amount.trim() && Number(amount) > 0 && paymentMode && (feeLineChoice === "OTHER" ? otherFeeName.trim().length >= 2 : feeLineChoice)
  );

  async function goReview() {
    if (!step2Ok || !studentProfileId) return;
    try {
      const body =
        feeLineChoice === "OTHER"
          ? {
              batchId,
              studentProfileId,
              feeLineKind: "OTHER" as const,
              otherFeeSpecification: otherFeeName.trim(),
              amount: Number(amount)
            }
          : {
              batchId,
              studentProfileId,
              feeLineKind: "ASSIGNMENT" as const,
              studentFeeAssignmentId: feeLineChoice,
              amount: Number(amount)
            };
      const result = await sendJson<PreviewResult>("/api/payments/preview", body);
      setPreview(result);
      setStep(3);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Preview failed", "error");
    }
  }

  async function submitPayment() {
    if (!preview || !studentProfileId) return;
    setSubmitting(true);
    try {
      const body =
        feeLineChoice === "OTHER"
          ? {
              batchId,
              studentProfileId,
              feeLineKind: "OTHER" as const,
              otherFeeSpecification: otherFeeName.trim(),
              amount: Number(amount),
              paymentMode,
              note: remarks.trim() || undefined,
              idempotencyKey
            }
          : {
              batchId,
              studentProfileId,
              feeLineKind: "ASSIGNMENT" as const,
              studentFeeAssignmentId: feeLineChoice,
              amount: Number(amount),
              paymentMode,
              note: remarks.trim() || undefined,
              idempotencyKey
            };
      await sendJson("/api/payments/register", body);
      showToast("Payment registered successfully.");
      setStep(1);
      setStudentProfileId("");
      setContext(null);
      setPayableLines([]);
      setFeeLineChoice("");
      setOtherFeeName("");
      setAmount("");
      setRemarks("");
      setPreview(null);
      setIdempotencyKey(safeRandomId("pay"));
      setRollInput("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Payment failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    return () => {
      setRollHits([]);
      setContext(null);
      setPayableLines([]);
      setCampuses([]);
      setPrograms([]);
      setBranches([]);
      setBatches([]);
      setRollInput("");
      setPreview(null);
      setStudentProfileId("");
    };
  }, []);

  return (
    <PaymentsShell title="Register fee" backHref={backHref}>
      <section className="db-card db-form">
        <div className="teacher-stepper" role="tablist" aria-label="Payment steps">
          {(
            [
              [1, "Identify"],
              [2, "Payment"],
              [3, "Review"]
            ] as const
          ).map(([n, label]) => (
            <button
              key={n}
              type="button"
              className={step === n ? "active" : ""}
              aria-current={step === n ? "step" : undefined}
              onClick={() => {
                if (n <= step) setStep(n);
              }}
            >
              <span>{n}</span>
              {label}
            </button>
          ))}
        </div>

        {step === 1 ? (
          <>
            <div className="fee-form-heading">
              <h2>Step 1 — Student identification</h2>
              <p>Choose campus through batch, then search by roll number only. Results load from the server as you type.</p>
            </div>
            <div className="teacher-form-grid">
              <Field label="Campus">
                <PlainSelect
                  value={campusId}
                  onChange={(id) => {
                    setCampusId(id);
                    resetHierarchy("campus");
                  }}
                  options={campuses.map((c) => [c.id, c.code])}
                  placeholder="Campus"
                />
              </Field>
              <Field label="Department">
                <PlainSelect disabled={!campusId} value={programId} onChange={(id) => { setProgramId(id); resetHierarchy("program"); }} options={programOptions} placeholder="Department" />
              </Field>
              <Field label="Branch">
                <PlainSelect disabled={!programId} value={branchId} onChange={(id) => { setBranchId(id); resetHierarchy("branch"); }} options={branchOptions} placeholder="Branch" />
              </Field>
              <Field label="Batch">
                <PlainSelect disabled={!branchId} value={batchId} onChange={(id) => { setBatchId(id); resetHierarchy("batch"); }} options={batchOptions} placeholder="Batch" />
              </Field>
            </div>
            <Field label="Roll number search">
              <Input value={rollInput} onChange={setRollInput} placeholder="Type roll number…" disabled={!batchId} autoComplete="off" />
              {rollLoading ? <p className="db-empty">Searching…</p> : null}
              {rollHits.length ? (
                <ul className="promotion-student-list" role="listbox">
                  {rollHits.map((hit) => (
                    <li key={hit.id}>
                      <button type="button" className="promotion-student-row" onClick={() => void pickStudent(hit)}>
                        <span>
                          <strong>{hit.rollNumber}</strong> — {hit.fullName}
                        </span>
                        <small>
                          {hit.classLabel} · Sem {hit.semesterNumber} · {hit.sectionName}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
            {context ? (
              <div className="payments-selected-summary">
                <h3>Selected student</h3>
                <p className="db-empty">
                  {context.student.fullName} ({context.student.rollNumber}) — {context.student.section.name} · {context.student.class.label} · Sem{" "}
                  {context.student.class.semesterNumber}
                </p>
                <p className="db-empty">
                  {context.student.campus.code} / {context.student.department.code} / {context.student.branch.code}
                </p>
                <p className="db-empty">Open payable lines: {context.payableFees.length}. Recent payments: loaded for step 2.</p>
              </div>
            ) : null}
            <div className="promotion-wizard-actions">
              <button type="button" className="db-submit" disabled={!step1Ok} onClick={() => setStep(2)}>
                Next: Payment entry
              </button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="fee-form-heading">
              <h2>Step 2 — Payment entry</h2>
              <p>Fee header options are generated from the student&apos;s pending balances. Choose Other for ad-hoc fees.</p>
            </div>
            <div className="teacher-form-grid">
              <Field label="Fee header">
                <PlainSelect value={feeLineChoice} onChange={setFeeLineChoice} options={feeLineOptions} placeholder="Select fee" />
              </Field>
              {feeLineChoice === "OTHER" ? (
                <Field label="Specify fee head">
                  <Input value={otherFeeName} onChange={setOtherFeeName} placeholder="e.g. Sports fee" />
                </Field>
              ) : null}
              <Field label="Enter amount">
                <Input type="number" min="1" value={amount} onChange={setAmount} />
              </Field>
              <Field label="Payment source">
                <PlainSelect value={paymentMode} onChange={setPaymentMode} options={PAYMENT_MODES} placeholder="Source" />
              </Field>
              <Field label="Remarks">
                <Input value={remarks} onChange={setRemarks} placeholder="Optional" />
              </Field>
            </div>
            <div className="promotion-wizard-actions">
              <button type="button" className="promotion-wizard-back" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="db-submit" disabled={!step2Ok} onClick={() => void goReview()}>
                Next: Review
              </button>
            </div>
          </>
        ) : null}

        {step === 3 && preview && context ? (
          <>
            <div className="fee-form-heading">
              <h2>Step 3 — Review</h2>
              <p>Confirm details before registering the payment.</p>
            </div>
            <div className="teacher-form-grid">
              <div className="db-field">
                <span>Student</span>
                <p className="db-empty">
                  {context.student.fullName} · {context.student.rollNumber}
                </p>
              </div>
              <div className="db-field">
                <span>Structure</span>
                <p className="db-empty">
                  {context.student.campus.name} / {context.student.department.name} / {context.student.branch.name}
                </p>
              </div>
              <div className="db-field">
                <span>Class &amp; section</span>
                <p className="db-empty">
                  {context.student.class.label} · {context.student.section.name} · Semester {context.student.class.semesterNumber}
                </p>
              </div>
              <div className="db-field">
                <span>Fee</span>
                <p className="db-empty">{preview.feeDisplayName ?? "—"}</p>
              </div>
              <div className="db-field">
                <span>Amount</span>
                <p className="db-empty">{preview.amount}</p>
              </div>
              <div className="db-field">
                <span>Payment source</span>
                <p className="db-empty">{PAYMENT_MODES.find((m) => m[0] === paymentMode)?.[1] ?? paymentMode}</p>
              </div>
              <div className="db-field">
                <span>Progress (server)</span>
                <p className="db-empty">
                  {preview.percentagePaid != null ? `${preview.percentagePaid}% · ${preview.paymentStatusWord}` : preview.paymentStatusWord}
                </p>
              </div>
            </div>
            <div className="promotion-wizard-actions">
              <button type="button" className="promotion-wizard-back" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="db-submit" disabled={submitting} onClick={() => void submitPayment()}>
                {submitting ? "Saving…" : "Register payment"}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </PaymentsShell>
  );
}

type HistoryRow = {
  id: string;
  receiptNo: string;
  amount: number;
  paymentMode: string;
  paidAt: string;
  status: string;
  feeHead: { name: string };
  student: { rollNumber: string; fullName: string };
};

export function PaymentsHistoryPage() {
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [historyItems, setHistoryItems] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [histRoll, setHistRoll] = useState("");
  const [histStatus, setHistStatus] = useState("");
  const [histMode, setHistMode] = useState("");
  const [histHead, setHistHead] = useState("");
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [feeHeads, setFeeHeads] = useState<{ id: string; name: string; code: string }[]>([]);

  const fetchJson = useCallback(
    async <T,>(path: string) => {
      const response = await authFetch(path);
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as T;
    },
    [authFetch]
  );

  useEffect(() => {
    void (async () => {
      try {
        const heads = await fetchJson<{ id: string; name: string; code: string }[]>("/api/finance/heads");
        setFeeHeads(heads);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load fee heads", "error");
      }
    })();
  }, [fetchJson, showToast]);

  async function loadHistory(page = 1) {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (histRoll.trim()) params.set("rollNumber", histRoll.trim());
      if (histStatus) params.set("status", histStatus);
      if (histMode) params.set("paymentMode", histMode);
      if (histHead) params.set("feeHeadId", histHead);
      if (histFrom) params.set("paidFrom", histFrom);
      if (histTo) params.set("paidTo", histTo);
      const data = await fetchJson<{ items: HistoryRow[]; total: number; page: number }>(`/api/payments/history?${params.toString()}`);
      setHistoryItems(data.items);
      setHistoryTotal(data.total);
      setHistoryPage(data.page);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "History load failed", "error");
    }
  }

  useEffect(() => {
    void loadHistory(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      setHistoryItems([]);
      setHistoryTotal(0);
      setFeeHeads([]);
    };
  }, []);

  return (
    <PaymentsShell title="Payment history" backHref="/payments">
      <section className="db-card db-form">
        <div className="fee-form-heading">
          <h2>Payment history</h2>
          <p>Server-side filters and pagination.</p>
        </div>
        <form
          className="teacher-form-grid"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void loadHistory(1);
          }}
        >
          <Field label="Roll number">
            <Input value={histRoll} onChange={setHistRoll} placeholder="Optional" />
          </Field>
          <Field label="Row status">
            <PlainSelect
              value={histStatus}
              onChange={setHistStatus}
              options={
                [
                  ["", "Any"],
                  ["ACTIVE", "Active"],
                  ["REVERSED", "Reversed / cancelled"]
                ] as [string, string][]
              }
              placeholder="Status"
            />
          </Field>
          <Field label="Payment source">
            <PlainSelect value={histMode} onChange={setHistMode} options={[["", "Any"], ...PAYMENT_MODES] as [string, string][]} placeholder="Source" />
          </Field>
          <Field label="Fee head">
            <PlainSelect
              value={histHead}
              onChange={setHistHead}
              options={[["", "Any"], ...feeHeads.map((h) => [h.id, h.name] as [string, string])] as [string, string][]}
              placeholder="Fee head"
            />
          </Field>
          <Field label="Paid from">
            <Input type="date" value={histFrom} onChange={setHistFrom} />
          </Field>
          <Field label="Paid to">
            <Input type="date" value={histTo} min={histFrom || undefined} onChange={setHistTo} />
          </Field>
          <div className="promotion-wizard-actions">
            <button type="submit" className="db-submit">
              Search
            </button>
          </div>
        </form>
        <div className="promotion-student-list">
          <div className="promotion-student-head">
            <span>Receipt</span>
            <span>Student</span>
            <span>Fee</span>
            <span>Amount</span>
            <span>Mode</span>
            <span>Status</span>
            <span>Paid at</span>
          </div>
          {historyItems.map((row) => (
            <div key={row.id} className="promotion-student-row">
              <span>{row.receiptNo}</span>
              <span>
                {row.student.rollNumber} — {row.student.fullName}
              </span>
              <span>{row.feeHead.name}</span>
              <span>{row.amount}</span>
              <span>{row.paymentMode}</span>
              <span>{row.status}</span>
              <span>{formatIstLocaleDateTime(row.paidAt)}</span>
            </div>
          ))}
        </div>
        <div className="promotion-wizard-actions">
          <button type="button" className="promotion-wizard-back" disabled={historyPage <= 1} onClick={() => void loadHistory(historyPage - 1)}>
            Previous
          </button>
          <span className="db-empty">
            Page {historyPage} — {historyTotal} records
          </span>
          <button type="button" className="db-submit" disabled={historyPage * 15 >= historyTotal} onClick={() => void loadHistory(historyPage + 1)}>
            Next
          </button>
        </div>
      </section>
    </PaymentsShell>
  );
}
