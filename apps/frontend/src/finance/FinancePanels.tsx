import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { todayIstDate, formatIstLocaleDate } from "../shared/ist-time";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { ModuleExportButton } from "../shared/export";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Branch, Campus, PaginatedResponse, Program, Section } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";

type FeeHead = { id: string; code: string; name: string };
type FeePayment = {
  id: string;
  receiptNo: string;
  amount: number;
  paymentMode: string;
  paidAt: string;
  status: "ACTIVE" | "REVERSED";
  feeHead: FeeHead;
  assignment?: { id: string; feeStructureId: string; feeHeadName: string; dueAmount: number; deadline?: string | null } | null;
  student: { id: string; rollNumber: string; fullName: string; section: string };
  receivedBy: string;
};
type StudentAssignedFee = {
  id: string;
  feeHeadName: string;
  dueAmount: number;
  paidAmount: number;
  balance: number;
  status: "PAID" | "PARTIAL" | "UNPAID";
  deadline?: string | null;
};
type FeeSummary = {
  summary: { due: number; paid: number; balance: number };
  heads: { feeHeadId: string; name: string; due: number; paid: number; balance: number }[];
  payments: { id: string; receiptNo: string; feeHead: string; amount: number; paymentMode: string; paidAt: string; receivedBy: string }[];
};
type StudentItem = { id: string; identity?: { rollNumber: string; fullName: string }; fullName?: string; rollNumber?: string; structure?: { section: Section }; section?: string; class?: string };

const inputClass = "db-input";

function useApi() {
  const { authFetch } = useAuth();

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Finance action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  return { fetchJson, sendJson };
}

export function AdminFinancePanel() {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [assignedFees, setAssignedFees] = useState<StudentAssignedFee[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<FeePayment | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [form, setForm] = useState({
    campusId: "",
    programId: "",
    branchId: "",
    classId: "",
    sectionId: "",
    studentProfileId: "",
    studentFeeAssignmentId: "",
    amount: "",
    paymentMode: "CASH",
    receiptNo: "",
    note: "",
    paidAt: todayIstDate()
  });

  async function loadCatalogs() {
    const [campusPage, programPage, branchPage, classPage, sectionPage] = await Promise.all([
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
      fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
      fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
      fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100")
    ]);
    setCampuses(campusPage.items);
    setPrograms(programPage.items);
    setBranches(branchPage.items);
    setClasses(classPage.items);
    setSections(sectionPage.items);
  }

  async function loadPayments(page = paymentPage) {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (paymentSearch.trim()) params.set("search", paymentSearch.trim());
    if (paymentStatus) params.set("status", paymentStatus);
    if (form.campusId) params.set("campusId", form.campusId);
    if (form.sectionId) params.set("sectionId", form.sectionId);
    const data = await fetchJson<PaginatedResponse<FeePayment>>(`/api/finance/payments?${params.toString()}`);
    setPayments(data.items);
    setPaymentTotal(data.total);
    setPaymentPage(data.page);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalogs().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load finance catalogs", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadPayments(paymentPage).catch((error) => showToast(error instanceof Error ? error.message : "Unable to load transactions", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentPage, paymentStatus, form.campusId, form.sectionId]);

  useEffect(() => {
    if (!form.sectionId) {
      setStudents([]);
      return;
    }
    void fetchJson<PaginatedResponse<StudentItem>>(`/api/fees/students/search?sectionId=${form.sectionId}&pageSize=100`)
      .then((data) => setStudents(data.items))
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to load students", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sectionId]);

  useEffect(() => {
    if (!form.studentProfileId) {
      setAssignedFees([]);
      return;
    }
    void fetchJson<{ items: StudentAssignedFee[] }>(`/api/finance/students/${form.studentProfileId}/assigned-fees`)
      .then((data) => setAssignedFees(data.items))
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to load assigned fees", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.studentProfileId]);

  const options = useMemo(() => {
    const filteredPrograms = programsForOperationalCampus(programs, form.campusId, campuses);
    const filteredBranches = branches.filter((branch) => !form.programId || branch.programId === form.programId);
    const filteredClasses = classes.filter((item) => {
      const classBranchId = (item as AcademicClass & { branchId?: string }).branchId ?? item.batch?.branchId;
      return !form.branchId || classBranchId === form.branchId;
    });
    const filteredSections = sections.filter((section) => !form.classId || section.classId === form.classId);
    return { programs: filteredPrograms, branches: filteredBranches, classes: filteredClasses, sections: filteredSections };
  }, [branches, campuses, classes, form.branchId, form.campusId, form.classId, form.programId, programs, sections]);

  const selectedAssignedFee = assignedFees.find((fee) => fee.id === form.studentFeeAssignmentId);

  useEffect(() => {
    if (selectedAssignedFee && !form.amount) setForm((current) => ({ ...current, amount: String(selectedAssignedFee.balance) }));
  }, [form.amount, selectedAssignedFee]);

  async function markPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.studentFeeAssignmentId) {
      showToast("Select an assigned fee before recording payment.", "error");
      return;
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      showToast("Enter a valid payment amount.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await sendJson("/api/finance/payments", {
        studentFeeAssignmentId: form.studentFeeAssignmentId,
        amount,
        paymentMode: form.paymentMode,
        paidAt: form.paidAt || undefined,
        receiptNo: form.receiptNo || undefined,
        note: form.note || undefined
      });
      showToast("Counter transaction recorded");
      setForm((current) => ({ ...current, studentFeeAssignmentId: "", amount: "", receiptNo: "", note: "", paidAt: todayIstDate() }));
      await Promise.all([
        loadPayments(1),
        form.studentProfileId ? fetchJson<{ items: StudentAssignedFee[] }>(`/api/finance/students/${form.studentProfileId}/assigned-fees`).then((data) => setAssignedFees(data.items)) : Promise.resolve()
      ]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to record transaction", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function reversePayment() {
    if (!reverseTarget || reverseReason.trim().length < 5) {
      showToast("Enter a reversal reason with at least 5 characters.", "error");
      return;
    }
    try {
      await sendJson(`/api/finance/payments/${reverseTarget.id}/reverse`, { reason: reverseReason });
      setReverseTarget(null);
      setReverseReason("");
      await loadPayments(paymentPage);
      if (form.studentProfileId) {
        const data = await fetchJson<{ items: StudentAssignedFee[] }>(`/api/finance/students/${form.studentProfileId}/assigned-fees`);
        setAssignedFees(data.items);
      }
      showToast("Transaction reversed", "warning");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to reverse transaction", "error");
    }
  }

  return (
    <section className="grid gap-5 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Finance Management</h2>
          <p className="text-sm text-slate-500">Counter transactions, assigned fee balances, reversals, and exports.</p>
        </div>
        <ModuleExportButton
          apiPath="/api/finance/export"
          pageName="Finance"
          cardName="FeePayments"
          queryParams={{
            pageSize: "100",
            search: paymentSearch.trim() || undefined,
            status: paymentStatus || undefined,
            campusId: form.campusId || undefined,
            sectionId: form.sectionId || undefined
          }}
          label="Export payments"
        />
      </div>

      <form className="erp-admin-form grid gap-4 rounded-xl border bg-slate-50 p-4" onSubmit={(event) => void markPayment(event)}>
        <div>
          <h3 className="text-base font-extrabold text-slate-950">Add Counter Transaction</h3>
          <p className="text-sm text-slate-500">Select hierarchy, student, and assigned fee before collecting cash/counter payment.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Campus"><PlainSelect value={form.campusId} options={campuses.map((item) => [item.id, item.code])} placeholder="Select campus" onChange={(campusId) => setForm({ ...form, campusId, programId: "", branchId: "", classId: "", sectionId: "", studentProfileId: "", studentFeeAssignmentId: "", amount: "" })} /></Field>
          <Field label="Department"><PlainSelect value={form.programId} options={options.programs.map((item) => [item.id, `${item.code} - ${item.name}`])} placeholder="Select department" onChange={(programId) => setForm({ ...form, programId, branchId: "", classId: "", sectionId: "", studentProfileId: "", studentFeeAssignmentId: "", amount: "" })} /></Field>
          <Field label="Branch"><PlainSelect value={form.branchId} options={options.branches.map((item) => [item.id, `${item.code} - ${item.name}`])} placeholder="Select branch" onChange={(branchId) => setForm({ ...form, branchId, classId: "", sectionId: "", studentProfileId: "", studentFeeAssignmentId: "", amount: "" })} /></Field>
          <Field label="Class"><PlainSelect value={form.classId} options={options.classes.map((item) => [item.id, item.label || `Semester ${item.semesterNumber}`])} placeholder="Select class" onChange={(classId) => setForm({ ...form, classId, sectionId: "", studentProfileId: "", studentFeeAssignmentId: "", amount: "" })} /></Field>
          <Field label="Section"><PlainSelect value={form.sectionId} options={options.sections.map((item) => [item.id, item.name])} placeholder="Select section" onChange={(sectionId) => setForm({ ...form, sectionId, studentProfileId: "", studentFeeAssignmentId: "", amount: "" })} /></Field>
          <Field label="Student"><PlainSelect value={form.studentProfileId} options={students.map((item) => [item.id, studentLabel(item)])} placeholder="Select student" onChange={(studentProfileId) => setForm({ ...form, studentProfileId, studentFeeAssignmentId: "", amount: "" })} disabled={!form.sectionId} /></Field>
          <Field label="Assigned Fee"><PlainSelect value={form.studentFeeAssignmentId} options={assignedFees.map((item) => [item.id, `${item.feeHeadName} - Balance ₹${item.balance}`])} placeholder="Select assigned fee" onChange={(studentFeeAssignmentId) => setForm({ ...form, studentFeeAssignmentId, amount: "" })} disabled={!form.studentProfileId} /></Field>
          <Field label="Payment Mode"><PlainSelect value={form.paymentMode} options={["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((mode) => [mode, mode.replace("_", " ")])} onChange={(paymentMode) => setForm({ ...form, paymentMode })} placeholder="Select mode" /></Field>
          <Field label="Paid Date"><input className={inputClass} type="date" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} required /></Field>
          <Field label="Amount"><input className={inputClass} type="number" min="1" max={selectedAssignedFee?.balance} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Amount paid" required /></Field>
          <Field label="Receipt No"><input className={inputClass} value={form.receiptNo} onChange={(event) => setForm({ ...form, receiptNo: event.target.value })} placeholder="Auto if empty" /></Field>
          <Field label="Note"><input className={inputClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional counter note" /></Field>
        </div>
        {selectedAssignedFee ? <AssignedFeeSummary fee={selectedAssignedFee} /> : null}
        <button className="rounded-lg bg-[#004B8D] px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving}>
          {isSaving ? "Recording..." : "Record Counter Transaction"}
        </button>
      </form>

      <section className="rounded-xl border bg-white">
        <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-[1fr_180px_120px]">
          <input className={inputClass} value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="Search receipt, student, roll number, or fee" />
          <PlainSelect value={paymentStatus} options={[["", "All Status"], ["ACTIVE", "Active"], ["REVERSED", "Reversed"]]} onChange={(status) => { setPaymentStatus(status); setPaymentPage(1); }} placeholder="Status" required={false} />
          <button className="rounded-lg border border-[#004B8D] px-4 py-2 text-sm font-bold text-[#004B8D]" type="button" onClick={() => { setPaymentPage(1); void loadPayments(1); }}>Search</button>
        </div>
        <PaymentList payments={payments} onReverse={(payment) => { setReverseTarget(payment); setReverseReason(""); }} />
        <Pagination page={paymentPage} pageSize={10} total={paymentTotal} onPage={setPaymentPage} />
      </section>

      <ReverseDialog payment={reverseTarget} reason={reverseReason} setReason={setReverseReason} onCancel={() => setReverseTarget(null)} onConfirm={reversePayment} />
    </section>
  );
}

export function TeacherFinancePanel() {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [assignedFees, setAssignedFees] = useState<StudentAssignedFee[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [reverseTarget, setReverseTarget] = useState<FeePayment | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [form, setForm] = useState({ studentProfileId: "", studentFeeAssignmentId: "", amount: "", paymentMode: "CASH", receiptNo: "", note: "", paidAt: todayIstDate() });
  const selectedAssignedFee = assignedFees.find((fee) => fee.id === form.studentFeeAssignmentId);

  async function load() {
    const [studentPage, paymentPage] = await Promise.all([
      fetchJson<PaginatedResponse<StudentItem>>("/api/portals/teacher/students?pageSize=100"),
      fetchJson<PaginatedResponse<FeePayment>>("/api/finance/payments?pageSize=10")
    ]);
    setStudents(studentPage.items);
    setPayments(paymentPage.items);
    const studentProfileId = form.studentProfileId || studentPage.items[0]?.id || "";
    setForm((current) => ({ ...current, studentProfileId }));
    if (studentProfileId) {
      const fees = await fetchJson<{ items: StudentAssignedFee[] }>(`/api/finance/students/${studentProfileId}/assigned-fees`);
      setAssignedFees(fees.items);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load fee data", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.studentFeeAssignmentId) {
      showToast("Select an assigned fee before marking payment.", "error");
      return;
    }
    await sendJson("/api/finance/payments", { ...form, amount: Number(form.amount), receiptNo: form.receiptNo || undefined, note: form.note || undefined, paidAt: form.paidAt || undefined });
    setForm({ ...form, studentFeeAssignmentId: "", amount: "", receiptNo: "", note: "", paidAt: todayIstDate() });
    await load();
    showToast("Fee payment marked");
  }

  async function loadStudentFees(studentProfileId: string) {
    setForm({ ...form, studentProfileId, studentFeeAssignmentId: "", amount: "" });
    const data = await fetchJson<{ items: StudentAssignedFee[] }>(`/api/finance/students/${studentProfileId}/assigned-fees`);
    setAssignedFees(data.items);
  }

  async function reversePayment() {
    if (!reverseTarget || reverseReason.trim().length < 5) {
      showToast("Enter a reversal reason with at least 5 characters.", "error");
      return;
    }
    await sendJson(`/api/finance/payments/${reverseTarget.id}/reverse`, { reason: reverseReason });
    setReverseTarget(null);
    setReverseReason("");
    await load();
    showToast("Payment reversed", "warning");
  }

  useEffect(() => {
    if (selectedAssignedFee && !form.amount) setForm((current) => ({ ...current, amount: String(selectedAssignedFee.balance) }));
  }, [form.amount, selectedAssignedFee]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">Fee Marking</h2>
      <p className="mb-4 text-sm text-slate-500">CTPO/HTPO can mark fee payments only within permitted scope.</p>
      <form className="erp-admin-form grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(event) => void markPayment(event)}>
        <Select value={form.studentProfileId} items={students.map((item) => [item.id, studentLabel(item)])} onChange={(studentProfileId) => void loadStudentFees(studentProfileId)} />
        <Select value={form.studentFeeAssignmentId} items={assignedFees.map((item) => [item.id, `${item.feeHeadName} - Balance ₹${item.balance}`])} onChange={(studentFeeAssignmentId) => setForm({ ...form, studentFeeAssignmentId, amount: "" })} />
        <input className={inputClass} type="number" min="1" max={selectedAssignedFee?.balance} placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
        <SearchableSelect value={form.paymentMode} options={["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((mode) => [mode, mode.replace("_", " ")])} onChange={(paymentMode) => setForm({ ...form, paymentMode })} searchable={false} />
        <input className={inputClass} type="date" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} required />
        <input className={inputClass} placeholder="Receipt optional" value={form.receiptNo} onChange={(event) => setForm({ ...form, receiptNo: event.target.value })} />
        <input className={inputClass} placeholder="Note optional" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        <button className="erp-panel-submit md:col-span-2">Mark Payment</button>
      </form>
      {selectedAssignedFee ? <div className="mt-4"><AssignedFeeSummary fee={selectedAssignedFee} /></div> : null}
      <PaymentList payments={payments} onReverse={(payment) => { setReverseTarget(payment); setReverseReason(""); }} />
      <ReverseDialog payment={reverseTarget} reason={reverseReason} setReason={setReverseReason} onCancel={() => setReverseTarget(null)} onConfirm={reversePayment} />
    </section>
  );
}

export function StudentFinancePanel() {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [data, setData] = useState<FeeSummary | null>(null);

  async function load() {
    setData(await fetchJson<FeeSummary>("/api/finance/me"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load fees", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">My Fees</h2>
          <p className="text-sm text-slate-500">Dues, balance, and payment history.</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Fees refreshed"))}>Refresh</SafeActionButton>
      </div>
      {data ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Total Due" value={data.summary.due} />
            <Metric label="Paid" value={data.summary.paid} />
            <Metric label="Balance" value={data.summary.balance} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.heads.map((head) => <Metric key={head.feeHeadId} label={head.name} value={head.balance} sub={`Paid ${head.paid} / Due ${head.due}`} />)}
          </div>
          <div className="rounded-xl border">
            <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold">Payment History</div>
            {data.payments.length ? data.payments.map((payment) => (
              <div key={payment.id} className="grid gap-2 border-b px-4 py-3 text-sm md:grid-cols-5">
                <span>{payment.receiptNo}</span>
                <span>{payment.feeHead}</span>
                <span>{payment.amount}</span>
                <span>{payment.paymentMode}</span>
                <span>{formatIstLocaleDate(payment.paidAt)}</span>
              </div>
            )) : <p className="px-4 py-6 text-sm text-slate-500">No payments yet.</p>}
          </div>
        </div>
      ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No fee data yet.</p>}
    </section>
  );
}

function PaymentList({ payments, onReverse }: { payments: FeePayment[]; onReverse?: (payment: FeePayment) => void | Promise<void> }) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border">
      <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Transaction History</div>
      {payments.length ? payments.map((payment) => (
        <div key={payment.id} className="grid gap-2 border-b px-4 py-3 text-sm text-slate-700 md:grid-cols-[1.1fr_1fr_1.2fr_1fr_.8fr_.9fr_.8fr_.8fr]">
          <span className="font-bold text-slate-950">{payment.receiptNo}</span>
          <span>{payment.student.rollNumber}</span>
          <span>{payment.student.fullName}</span>
          <span>{payment.assignment?.feeHeadName ?? payment.feeHead.name}</span>
          <span>₹{payment.amount}</span>
          <span>{payment.paymentMode.replace("_", " ")}</span>
          <span className={payment.status === "ACTIVE" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{payment.status}</span>
          {onReverse && payment.status === "ACTIVE" ? <button className="text-left font-semibold text-red-600" onClick={() => void onReverse(payment)}>Reverse</button> : null}
        </div>
      )) : <p className="px-4 py-6 text-sm text-slate-500">No payments yet.</p>}
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PlainSelect({
  disabled = false,
  onChange,
  options,
  placeholder,
  required = true,
  value
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: [string, string][];
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  return <SearchableSelect value={value} options={options} onChange={onChange} placeholder={placeholder} required={required} clearable={!required} searchable={false} disabled={disabled} />;
}

function AssignedFeeSummary({ fee }: { fee: StudentAssignedFee }) {
  return (
    <div className="grid gap-3 rounded-xl border border-blue-100 bg-white p-4 text-sm md:grid-cols-4">
      <Metric label="Due Amount" value={fee.dueAmount} />
      <Metric label="Already Paid" value={fee.paidAmount} />
      <Metric label="Balance" value={fee.balance} />
      <div className="rounded-xl border bg-slate-50 p-4">
        <p className="text-sm text-slate-500">Status</p>
        <p className="text-2xl font-bold text-slate-950">{fee.status}</p>
        {fee.deadline ? <p className="text-xs text-slate-500">Due {formatIstLocaleDate(fee.deadline)}</p> : null}
      </div>
    </div>
  );
}

function Pagination({ onPage, page, pageSize, total }: { onPage: (page: number) => void; page: number; pageSize: number; total: number }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <button className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">Previous</button>
      <span className="font-semibold text-slate-600">Page {page} of {pages}</span>
      <button className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50" disabled={page >= pages} onClick={() => onPage(page + 1)} type="button">Next</button>
    </div>
  );
}

function ReverseDialog({
  onCancel,
  onConfirm,
  payment,
  reason,
  setReason
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  payment: FeePayment | null;
  reason: string;
  setReason: (reason: string) => void;
}) {
  if (!payment) return null;
  return (
    <div className="erp-confirm-overlay" role="presentation">
      <section className="erp-confirm-card" aria-modal="true" role="dialog" aria-labelledby="reverse-payment-title">
        <h2 id="reverse-payment-title">Reverse transaction?</h2>
        <p>This will mark receipt {payment.receiptNo} as reversed and recalculate the assigned fee balance.</p>
        <textarea className={`${inputClass} min-h-24`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for reversal" />
        <div className="erp-confirm-actions">
          <button className="erp-confirm-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="erp-confirm-danger" type="button" onClick={() => void onConfirm()}>Reverse</button>
        </div>
      </section>
    </div>
  );
}

function studentLabel(student: StudentItem) {
  const rollNumber = student.identity?.rollNumber ?? student.rollNumber ?? "No roll";
  const fullName = student.identity?.fullName ?? student.fullName ?? "Student";
  return `${rollNumber} - ${fullName}`;
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-950">₹{value}</p>
      {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Select({ value, items, onChange, required = true }: { value: string; items: string[][]; onChange: (value: string) => void; required?: boolean }) {
  return (
    <SearchableSelect value={value} options={items.map(([id, label]) => [id, label])} onChange={onChange} required={required} clearable={!required} />
  );
}
