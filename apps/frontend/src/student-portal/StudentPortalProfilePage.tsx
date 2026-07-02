import { KeyRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { ChangePasswordDialog } from "../shared/ChangePasswordDialog";
import { ErpDateField } from "../shared/ErpDateField";
import { useToast } from "../shared/toast-context";
import { StudentProfilePhotoSection } from "./profile/StudentProfilePhotoSection";
import { StudentPortalProfileSkeleton } from "./profile/StudentPortalProfileSkeleton";
import type { StudentProfileResponse } from "./profile/student-profile-types";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalProfilePage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [address, setAddress] = useState("");
  const [addr, setAddr] = useState({ village: "", mandal: "", district: "", state: "", pincode: "", homeAddress: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/student/engage/profile");
      if (!res.ok) throw await readError(res);
      const profile = (await res.json()) as StudentProfileResponse;
      setData(profile);
      setPhone(profile.personal.phone);
      setDateOfBirth(profile.personal.dateOfBirth ?? "");
      setGuardianName(profile.personal.guardianName);
      setAddress(profile.personal.address);
      setAddr({
        village: profile.personal.village ?? "",
        mandal: profile.personal.mandal ?? "",
        district: profile.personal.district ?? "",
        state: profile.personal.state ?? "",
        pincode: profile.personal.pincode ?? "",
        homeAddress: profile.personal.homeAddress ?? ""
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load profile.", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/portals/student/engage/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          guardianName: guardianName.trim() || undefined,
          village: addr.village.trim() || undefined,
          mandal: addr.mandal.trim() || undefined,
          district: addr.district.trim() || undefined,
          state: addr.state.trim() || undefined,
          pincode: addr.pincode.trim() || undefined,
          homeAddress: addr.homeAddress.trim() || undefined
        })
      });
      if (!res.ok) throw await readError(res);
      const profile = (await res.json()) as StudentProfileResponse;
      setData(profile);
      showToast("Profile saved.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <StudentPortalProfileSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Profile could not be loaded.</p>;
  }

  const { personal, academic, editable } = data;

  return (
    <div className="sp-profile">
      <header className="sp-profile-head">
        <p className="sp-profile-page-sub">Your personal details and academic placement.</p>
        <button type="button" className="sp-profile-password-btn" onClick={() => setPasswordOpen(true)}>
          <KeyRound size={16} aria-hidden />
          Change password
        </button>
      </header>

      <div className="sp-profile-grid">
        <section className="sp-profile-card" aria-labelledby="sp-profile-personal-title">
          <h2 id="sp-profile-personal-title" className="sp-profile-card-title">
            Personal information
          </h2>
          <StudentProfilePhotoSection
            avatarUrl={personal.avatarUrl}
            fullName={personal.fullName}
            canEdit={editable.avatar}
            onPhotoUpdated={() => void load()}
          />

          <form className="sp-profile-form" onSubmit={(e) => void handleSave(e)}>
            <label className="sp-profile-field">
              <span>Full name</span>
              <input className="sp-profile-input sp-profile-input--readonly" value={personal.fullName} readOnly disabled />
            </label>
            <label className="sp-profile-field">
              <span>Roll number</span>
              <input className="sp-profile-input sp-profile-input--readonly" value={personal.rollNumber} readOnly disabled />
            </label>
            <label className="sp-profile-field">
              <span>Date of birth</span>
              <ErpDateField
                className="sp-profile-date-field"
                value={dateOfBirth}
                onChange={setDateOfBirth}
                disabled={!editable.dateOfBirth || saving}
                placeholder="Select date of birth"
              />
            </label>
            <label className="sp-profile-field">
              <span>Email</span>
              <input className="sp-profile-input sp-profile-input--readonly" value={personal.email} readOnly disabled />
            </label>
            <label className="sp-profile-field">
              <span>Phone number</span>
              <input
                className="sp-profile-input"
                type="tel"
                value={phone}
                disabled={!editable.phone || saving}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile"
              />
            </label>
            <label className="sp-profile-field">
              <span>Father / guardian name</span>
              <input
                className="sp-profile-input"
                value={guardianName}
                disabled={!editable.guardianName || saving}
                onChange={(e) => setGuardianName(e.target.value)}
              />
            </label>
            {([
              ["village", "Village"],
              ["mandal", "Mandal"],
              ["district", "District"],
              ["state", "State"],
              ["pincode", "Pincode"]
            ] as const).map(([key, label]) => (
              <label className="sp-profile-field" key={key}>
                <span>{label}</span>
                <input
                  className="sp-profile-input"
                  value={addr[key]}
                  disabled={!editable.address || saving}
                  onChange={(e) => setAddr((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label className="sp-profile-field sp-profile-field--full">
              <span>Home address</span>
              <textarea
                className="sp-profile-textarea"
                rows={2}
                value={addr.homeAddress}
                placeholder="House no, street, landmark"
                disabled={!editable.address || saving}
                onChange={(e) => setAddr((prev) => ({ ...prev, homeAddress: e.target.value }))}
              />
            </label>
            <button type="submit" className="sp-profile-save-btn" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        <section className="sp-profile-card" aria-labelledby="sp-profile-academic-title">
          <h2 id="sp-profile-academic-title" className="sp-profile-card-title">
            Academic information
          </h2>
          <p className="sp-profile-card-hint">Managed by the institution — read only.</p>
          <dl className="sp-profile-academic-grid">
            <div>
              <dt>Campus</dt>
              <dd>
                {academic.campus.code} — {academic.campus.name}
              </dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>
                {academic.department.code} — {academic.department.name}
              </dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>
                {academic.branch.code} — {academic.branch.name}
              </dd>
            </div>
            <div>
              <dt>Batch</dt>
              <dd>{academic.batch.code}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{academic.class.label}</dd>
            </div>
            <div>
              <dt>Section</dt>
              <dd>
                {academic.section.code ?? academic.section.name}
                {academic.section.code ? ` (${academic.section.name})` : ""}
              </dd>
            </div>
            <div>
              <dt>Semester</dt>
              <dd>
                {academic.semesterLabel} <span className="sp-profile-sem-index">(index {academic.semesterNumber})</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {passwordOpen ? <ChangePasswordDialog onClose={() => setPasswordOpen(false)} /> : null}
    </div>
  );
}
