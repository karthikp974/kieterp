import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

type TeacherWelcomeEmail = {
  email: string;
  fullName: string;
  employeeCode: string;
  temporaryPassword: string;
  assignments: string[];
};

type PasswordResetEmail = {
  email: string;
  fullName: string;
  resetUrl: string;
  expiresMinutes: number;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(input: PasswordResetEmail) {
    if (!this.isEmailEnabled()) {
      this.logger.warn("Email sending is disabled (set EMAIL_ENABLED=true to enable). Password reset email not sent.");
      return false;
    }
    const transporter = this.createTransporter();
    if (!transporter) {
      this.logger.error("SMTP is not configured. Password reset email was not sent.");
      return false;
    }

    const from = this.resolveFromAddress();
    if (!from) {
      this.logger.error("EMAIL_FROM_ADDRESS/SMTP_USER is not configured. Password reset email was not sent.");
      return false;
    }

    const result = await transporter.sendMail({
      from,
      to: input.email,
      subject: "Reset your KIET ERP password",
      text: [
        `Hello ${input.fullName},`,
        "",
        "We received a request to reset your KIET ERP password.",
        `Use this link within ${input.expiresMinutes} minutes (single use):`,
        input.resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
        "",
        "Regards,",
        "KIET ERP"
      ].join("\n"),
      html: [
        `<p>Hello ${escapeHtml(input.fullName)},</p>`,
        "<p>We received a request to reset your KIET ERP password.</p>",
        `<p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a> (expires in ${input.expiresMinutes} minutes, single use)</p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
        "<p>Regards,<br>KIET ERP</p>"
      ].join("")
    });
    this.logger.log(`Password reset email sent to ${input.email}. MessageId: ${result.messageId}`);
    return true;
  }

  async sendTeacherWelcome(input: TeacherWelcomeEmail) {
    if (!this.isEmailEnabled()) {
      this.logger.warn("Email sending is disabled (set EMAIL_ENABLED=true to enable). Skipping teacher welcome email.");
      return;
    }
    const transporter = this.createTransporter();
    if (!transporter) {
      this.logger.warn("SMTP is not configured. Skipping teacher welcome email.");
      return;
    }

    const from = this.resolveFromAddress();
    if (!from) {
      this.logger.warn("EMAIL_FROM_ADDRESS/SMTP_USER is not configured. Skipping teacher welcome email.");
      return;
    }

    const result = await transporter.sendMail({
      from,
      to: input.email,
      subject: "Welcome to KIET ERP",
      text: [
        `Hello ${input.fullName},`,
        "",
        "Your teacher account has been created in KIET ERP.",
        `Teacher ID: ${input.employeeCode}`,
        `Temporary password: ${input.temporaryPassword}`,
        "",
        "Assigned responsibilities:",
        ...(input.assignments.length ? input.assignments.map((assignment) => `- ${assignment}`) : ["- No assignments added"]),
        "",
        "Please sign in and change your password after first login.",
        "",
        "Regards,",
        "KIET ERP"
      ].join("\n")
    });
    this.logger.log(`Teacher welcome email sent to ${input.email}. MessageId: ${result.messageId}`);
  }

  private resolveFromAddress() {
    const fromName = this.config.get<string>("EMAIL_FROM_NAME") ?? "KIET ERP";
    const fromAddress = this.config.get<string>("EMAIL_FROM_ADDRESS") ?? this.config.get<string>("SMTP_USER");
    if (!fromAddress) return null;
    return `"${fromName}" <${fromAddress}>`;
  }

  /** Email is off unless EMAIL_ENABLED is explicitly "true". Keeps nodemailer's
   *  send paths dormant while the dependency stays installed. */
  private isEmailEnabled() {
    return (this.config.get<string>("EMAIL_ENABLED") ?? "false").trim().toLowerCase() === "true";
  }

  private createTransporter() {
    const host = this.config.get<string>("SMTP_HOST");
    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASS");
    const port = Number(this.config.get<string>("SMTP_PORT") ?? 587);
    if (!host || !user || !pass) return null;
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
