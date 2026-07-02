import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import {
  DEMO_ADMIN_IDENTIFIER,
  DEMO_ADMIN_PASSWORD,
  DEMO_STUDENT_ACCOUNTS,
  DEMO_STUDENT_PASSWORD,
  DEMO_TEACHER_ACCOUNTS,
  DEMO_TEACHER_PASSWORD
} from "./demo-credentials";
import { getDefaultPortal } from "./portal-redirect";
import { useToast } from "../shared/toast-context";

type DemoBoxProps = {
  kind: "admin" | "teacher" | "student";
  title: string;
  subtitle?: string;
  identifier: string;
  password: string;
  activeId: string | null;
  boxId: string;
  disabled: boolean;
  onSelect: () => void;
};

function DemoAccountBox({ kind, title, subtitle, identifier, password, activeId, boxId, disabled, onSelect }: DemoBoxProps) {
  return (
    <button
      type="button"
      className={`login-demo-box login-demo-box--${kind}${activeId === boxId ? " is-active" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <p className="login-demo-box-kind">{kind === "admin" ? "Admin" : kind === "teacher" ? "Teacher" : "Student"}</p>
      <h3 className="login-demo-box-title">{title}</h3>
      {subtitle ? <p className="login-demo-box-desc">{subtitle}</p> : null}
      <dl className="login-demo-box-creds">
        <div>
          <dt>Login ID</dt>
          <dd>{identifier}</dd>
        </div>
        <div>
          <dt>Password</dt>
          <dd>{password}</dd>
        </div>
      </dl>
      <span className="login-demo-box-action">Sign in →</span>
    </button>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to={getDefaultPortal(user.type, user.username)} replace />;
  }

  async function performLogin(identifier: string, password: string, demoId: string | null = null) {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    if (demoId) setActiveDemoId(demoId);

    try {
      const loggedInUser = await login(identifier.trim(), password);
      showToast(`Welcome ${loggedInUser.fullName}`);
      void navigate(getDefaultPortal(loggedInUser.type, loggedInUser.username), { replace: true });
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Login failed.";
      setError(message);
      showToast(message, "error");
      setActiveDemoId(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitManualLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await performLogin(loginIdentifier, loginPassword);
  }

  return (
    <main className="login-page portal-no-footer">
      <div className="login-page-shell">
        <header className="login-hero">
          <h1 className="login-title">
            Welcome to your <span className="login-title-muted">campus.</span>
          </h1>
          <br />
          <h5 className="login-demo-heading">Sign in demo accounts</h5>
        </header>

        <form className="login-form login-manual-form" onSubmit={(event) => void submitManualLogin(event)}>
          <label className="login-field">
            <span>Roll number / employee code</span>
            <input
              value={loginIdentifier}
              onChange={(event) => setLoginIdentifier(event.target.value)}
              className="login-input"
              autoComplete="username"
              type="text"
              placeholder="e.g. 22BTECH-AI-001 or HTPO001"
              required
            />
          </label>
          <label className="login-field">
            <span>Password</span>
            <div className="login-password-wrap">
              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="login-input login-input--password"
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-4 .71l2.17 2.17C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15"
                    />
                  </svg>
                )}
              </button>
            </div>
          </label>
          <button type="submit" className="login-submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in →"}
          </button>
          {error ? <p className="login-error">{error}</p> : null}
        </form>

        <p className="login-demo-disclaimer" role="note">
          The one-click sign-in options below are for <strong>demo and evaluation use only</strong>. In production,
          please sign in with your assigned roll number or employee code and password using the form above.
        </p>

        <section className="login-demo-groups" aria-label="Demo accounts">
          <div className="login-demo-group">
            <h6 className="login-demo-group-label">Admin</h6>
            <div className="login-demo-grid">
              <DemoAccountBox
                kind="admin"
                boxId="admin"
                title="Institution admin"
                identifier={DEMO_ADMIN_IDENTIFIER}
                password={DEMO_ADMIN_PASSWORD}
                activeId={activeDemoId}
                disabled={isSubmitting}
                onSelect={() => void performLogin(DEMO_ADMIN_IDENTIFIER, DEMO_ADMIN_PASSWORD, "admin")}
              />
            </div>
          </div>

          <div className="login-demo-group">
            <h6 className="login-demo-group-label">Teachers</h6>
            <div className="login-demo-grid">
              {DEMO_TEACHER_ACCOUNTS.map((account) => (
                <DemoAccountBox
                  key={account.id}
                  kind="teacher"
                  boxId={account.id}
                  title={account.fullName}
                  subtitle={`${account.roles} — ${account.description}`}
                  identifier={account.identifier}
                  password={DEMO_TEACHER_PASSWORD}
                  activeId={activeDemoId}
                  disabled={isSubmitting}
                  onSelect={() => void performLogin(account.identifier, DEMO_TEACHER_PASSWORD, account.id)}
                />
              ))}
            </div>
          </div>

          <div className="login-demo-group">
            <h6 className="login-demo-group-label">Students</h6>
            <div className="login-demo-grid">
              {DEMO_STUDENT_ACCOUNTS.map((account) => (
                <DemoAccountBox
                  key={account.id}
                  kind="student"
                  boxId={account.id}
                  title={account.fullName}
                  identifier={account.identifier}
                  password={DEMO_STUDENT_PASSWORD}
                  activeId={activeDemoId}
                  disabled={isSubmitting}
                  onSelect={() => void performLogin(account.identifier, DEMO_STUDENT_PASSWORD, account.id)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
