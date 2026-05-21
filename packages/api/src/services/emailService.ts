import { Resend } from 'resend';
import { eq, and, or, isNull } from 'drizzle-orm';
import { emailRecipientConfig } from '@curavend/db';

const FROM_ADDRESS = 'Curavend <noreply@curavend.com>';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
  /** When set, EmailService loads CC/BCC config rows for this templateKey and merges them in. */
  templateKey?: string;
  /** Optional tenant scope for templateKey lookup. */
  tenantId?: string | null;
}

export class EmailService {
  private resend: Resend;
  private db: any | undefined;

  constructor(apiKey: string, db?: any) {
    this.resend = new Resend(apiKey);
    this.db = db;
  }

  /**
   * Resolve cc/bcc lists from the email_recipient_config table for a given
   * (templateKey, tenantId). The tenant-specific row wins; falls back to the
   * global row (tenant_id IS NULL).
   */
  async resolveTemplateRecipients(
    templateKey: string,
    tenantId?: string | null,
  ): Promise<{ cc: string[]; bcc: string[] }> {
    if (!this.db) return { cc: [], bcc: [] };
    const rows = await this.db
      .select()
      .from(emailRecipientConfig)
      .where(
        and(
          eq(emailRecipientConfig.templateKey, templateKey),
          eq(emailRecipientConfig.enabled, 1),
          tenantId
            ? or(
                eq(emailRecipientConfig.tenantId, tenantId),
                isNull(emailRecipientConfig.tenantId),
              )
            : isNull(emailRecipientConfig.tenantId),
        ),
      );
    // Prefer tenant-specific over global; both contribute if present
    const tenantRow = rows.find((r: any) => r.tenantId === tenantId);
    const globalRow = rows.find((r: any) => r.tenantId === null);
    const cc = [
      ...parseArr(tenantRow?.ccEmails),
      ...parseArr(globalRow?.ccEmails),
    ];
    const bcc = [
      ...parseArr(tenantRow?.bccEmails),
      ...parseArr(globalRow?.bccEmails),
    ];
    return { cc: dedupe(cc), bcc: dedupe(bcc) };
  }

  /**
   * Send a raw email. Supports cc/bcc explicitly or via templateKey lookup.
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    let cc = options.cc ?? [];
    let bcc = options.bcc ?? [];
    if (options.templateKey) {
      const resolved = await this.resolveTemplateRecipients(
        options.templateKey,
        options.tenantId,
      );
      cc = dedupe([...cc, ...resolved.cc]);
      bcc = dedupe([...bcc, ...resolved.bcc]);
    }
    await this.resend.emails.send({
      from: FROM_ADDRESS,
      to: Array.isArray(options.to) ? options.to : [options.to],
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject: options.subject,
      html: options.html,
    });
  }

  /**
   * Medzah-parity named helpers.
   */
  async sendResetPasswordEmail(email: string, code: string, tenantId?: string | null): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Curavend Password Reset',
      html: passwordResetTemplate(code),
      templateKey: 'password_reset',
      tenantId,
    });
  }

  async sendSetPasswordEmail(
    user: { email: string; name: string | null; tempPassword: string },
    tenantId?: string | null,
  ): Promise<void> {
    await this.sendEmail({
      to: user.email,
      subject: 'Set Your Curavend Password',
      html: welcomeTemplate(user.name || user.email, user.email, user.tempPassword),
      templateKey: 'set_password',
      tenantId,
    });
  }

  async sendGenericEmail(
    to: string,
    subject: string,
    bodyHtml: string,
    opts: { templateKey?: string; tenantId?: string | null; cc?: string[]; bcc?: string[] } = {},
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject,
      html: baseLayout(bodyHtml),
      cc: opts.cc,
      bcc: opts.bcc,
      templateKey: opts.templateKey,
      tenantId: opts.tenantId,
    });
  }

  /**
   * Send email OTP for MFA / step-up.
   */
  async sendEmailOtp(email: string, code: string, purposeLabel: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Curavend Verification Code: ${code}`,
      html: emailOtpTemplate(code, purposeLabel),
    });
  }

  /**
   * Send welcome email to a newly created user with a temporary password.
   */
  async sendWelcomeEmail(user: {
    email: string;
    name: string | null;
    tempPassword: string;
  }): Promise<void> {
    const displayName = user.name || user.email;
    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to Curavend',
      html: welcomeTemplate(displayName, user.email, user.tempPassword),
      templateKey: 'welcome',
    });
  }

  /**
   * Send password reset code.
   */
  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Curavend Password Reset',
      html: passwordResetTemplate(code),
      templateKey: 'password_reset',
    });
  }

  /**
   * Send order status notification.
   */
  async sendOrderNotification(order: {
    identifier: string | null;
    status: string;
    patientName: string | null;
  }, recipientEmail: string, template: 'status_update' | 'new_order' | 'order_cancelled'): Promise<void> {
    const subjectMap = {
      status_update: `Order ${order.identifier ?? 'N/A'} Status Updated`,
      new_order: `New Order ${order.identifier ?? 'N/A'} Received`,
      order_cancelled: `Order ${order.identifier ?? 'N/A'} Cancelled`,
    };

    await this.sendEmail({
      to: recipientEmail,
      subject: subjectMap[template],
      html: orderNotificationTemplate(order, template),
    });
  }

  /**
   * Send invoice notification.
   */
  async sendInvoiceEmail(invoice: {
    invoiceNumber: string;
    total: number;
    vendorName: string | null;
  }, recipientEmail: string): Promise<void> {
    await this.sendEmail({
      to: recipientEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${invoice.vendorName ?? 'Vendor'}`,
      html: invoiceTemplate(invoice),
    });
  }

  /**
   * Send support ticket notification.
   */
  async sendSupportTicketEmail(ticket: {
    ticketNumber: string;
    subject: string;
    status: string;
  }, recipientEmail: string): Promise<void> {
    await this.sendEmail({
      to: recipientEmail,
      subject: `Support Ticket #${ticket.ticketNumber}: ${ticket.subject}`,
      html: supportTicketTemplate(ticket),
    });
  }

  /**
   * Send contract expiry warning.
   */
  async sendContractExpiryEmail(contract: {
    contractName: string;
    expiryDate: string;
    vendorName: string;
    hospitalName: string;
  }, recipientEmail: string): Promise<void> {
    await this.sendEmail({
      to: recipientEmail,
      subject: `Contract Expiring Soon: ${contract.contractName}`,
      html: contractExpiryTemplate(contract),
    });
  }

  /**
   * Send chat message notification.
   */
  async sendChatNotificationEmail(room: {
    roomName: string;
    orderId: string;
  }, message: {
    senderName: string;
    content: string;
  }, recipientEmail: string): Promise<void> {
    await this.sendEmail({
      to: recipientEmail,
      subject: `New message in ${room.roomName}`,
      html: chatNotificationTemplate(room, message),
    });
  }
}

// ─── Email Templates ────────────────────────────────────────────────────────

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:24px;margin-bottom:24px;">
    <tr>
      <td style="background:#1e3a5f;padding:24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Curavend</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 24px;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="background:#f9fafb;padding:16px 24px;text-align:center;font-size:12px;color:#6b7280;">
        <p style="margin:0;">&copy; ${new Date().getFullYear()} Curavend Healthcare Supply Chain. All rights reserved.</p>
        <p style="margin:4px 0 0;">This is an automated message. Please do not reply directly.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function welcomeTemplate(name: string, email: string, tempPassword: string): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">Welcome to Curavend, ${escapeHtml(name)}!</h2>
    <p style="color:#374151;line-height:1.6;">Your account has been created. Use the credentials below to sign in:</p>
    <table role="presentation" style="background:#f3f4f6;border-radius:8px;padding:16px;width:100%;margin:16px 0;">
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Email</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(email)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Temporary Password</td><td style="padding:8px;color:#111827;font-weight:600;font-family:monospace;">${escapeHtml(tempPassword)}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">You will be required to change your password upon first login.</p>
    <p style="color:#ef4444;font-size:13px;line-height:1.5;">For your security, do not share this email with anyone.</p>
  `);
}

function passwordResetTemplate(code: string): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">Password Reset Request</h2>
    <p style="color:#374151;line-height:1.6;">Use the code below to reset your password. This code expires in 15 minutes.</p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;background:#1e3a5f;color:#ffffff;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 32px;border-radius:8px;font-family:monospace;">${escapeHtml(code)}</span>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.5;">If you did not request a password reset, you can safely ignore this email.</p>
  `);
}

function orderNotificationTemplate(
  order: { identifier: string | null; status: string; patientName: string | null },
  template: string,
): string {
  const titleMap: Record<string, string> = {
    status_update: 'Order Status Updated',
    new_order: 'New Order Received',
    order_cancelled: 'Order Cancelled',
  };
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">${titleMap[template] ?? 'Order Notification'}</h2>
    <table role="presentation" style="background:#f3f4f6;border-radius:8px;padding:16px;width:100%;margin:16px 0;">
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Order ID</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(order.identifier ?? 'N/A')}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Status</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(order.status)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Patient</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(order.patientName ?? 'N/A')}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Log in to Curavend to view the full order details.</p>
  `);
}

function invoiceTemplate(invoice: {
  invoiceNumber: string;
  total: number;
  vendorName: string | null;
}): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">Invoice Notification</h2>
    <table role="presentation" style="background:#f3f4f6;border-radius:8px;padding:16px;width:100%;margin:16px 0;">
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Invoice #</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(invoice.invoiceNumber)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Vendor</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(invoice.vendorName ?? 'N/A')}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Total</td><td style="padding:8px;color:#111827;font-weight:600;">$${invoice.total.toFixed(2)}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Log in to Curavend to view and manage this invoice.</p>
  `);
}

function supportTicketTemplate(ticket: {
  ticketNumber: string;
  subject: string;
  status: string;
}): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">Support Ticket Update</h2>
    <table role="presentation" style="background:#f3f4f6;border-radius:8px;padding:16px;width:100%;margin:16px 0;">
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Ticket #</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(ticket.ticketNumber)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Subject</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(ticket.subject)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Status</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(ticket.status)}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Log in to Curavend to view and respond to this ticket.</p>
  `);
}

function contractExpiryTemplate(contract: {
  contractName: string;
  expiryDate: string;
  vendorName: string;
  hospitalName: string;
}): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#dc2626;">Contract Expiry Warning</h2>
    <p style="color:#374151;line-height:1.6;">The following contract is approaching its expiration date:</p>
    <table role="presentation" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;width:100%;margin:16px 0;">
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Contract</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(contract.contractName)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Vendor</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(contract.vendorName)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Hospital</td><td style="padding:8px;color:#111827;font-weight:600;">${escapeHtml(contract.hospitalName)}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;font-size:14px;">Expiry Date</td><td style="padding:8px;color:#dc2626;font-weight:600;">${escapeHtml(contract.expiryDate)}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Please take action to renew or address this contract before it expires.</p>
  `);
}

function chatNotificationTemplate(
  room: { roomName: string; orderId: string },
  message: { senderName: string; content: string },
): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">New Chat Message</h2>
    <p style="color:#374151;line-height:1.6;">You have a new message in <strong>${escapeHtml(room.roomName)}</strong> (Order: ${escapeHtml(room.orderId)}):</p>
    <div style="background:#f3f4f6;border-left:4px solid #1e3a5f;padding:16px;border-radius:0 8px 8px 0;margin:16px 0;">
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:600;">${escapeHtml(message.senderName)}</p>
      <p style="margin:0;color:#111827;line-height:1.5;">${escapeHtml(message.content)}</p>
    </div>
    <p style="color:#374151;line-height:1.6;">Log in to Curavend to reply.</p>
  `);
}

export interface SlaBreachRow {
  identifier: string;
  patient?: string | null;
  status?: string | null;
  ageHours: number;
  detail?: string | null;
}

/**
 * SLA breach summary email — used by the daily order SLA monitor cron.
 * Lists every breached order in one HTML table so a hospital/lab admin
 * doesn't get spammed with N separate emails.
 */
export function slaBreachTemplate(
  breachLabel: string,
  rows: SlaBreachRow[],
  detailColumnLabel = 'Status',
): string {
  const capped = rows.slice(0, 50);
  const overflowFooter =
    rows.length > 50
      ? `<p style="color:#6b7280;font-size:13px;text-align:center;margin-top:8px;">+${rows.length - 50} more breach(es) not shown — log in to view all.</p>`
      : '';
  return baseLayout(`
    <h2 style="margin:0 0 8px;color:#dc2626;">⚠️ SLA Breach: ${escapeHtml(breachLabel)}</h2>
    <p style="color:#374151;line-height:1.6;">${rows.length} order(s) have breached their service-level agreement and need attention.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-top:16px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:10px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">Order #</th>
          <th style="padding:10px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">Patient</th>
          <th style="padding:10px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">${escapeHtml(detailColumnLabel)}</th>
          <th style="padding:10px;text-align:right;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">Age</th>
        </tr>
      </thead>
      <tbody>
        ${capped
          .map(
            (r) => `
        <tr>
          <td style="padding:10px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;font-family:monospace;">${escapeHtml(r.identifier)}</td>
          <td style="padding:10px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${escapeHtml(r.patient ?? '—')}</td>
          <td style="padding:10px;font-size:13px;color:#dc2626;border-bottom:1px solid #f3f4f6;">${escapeHtml(r.detail ?? r.status ?? '—')}</td>
          <td style="padding:10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:right;">${r.ageHours.toFixed(0)} h</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    ${overflowFooter}
    <p style="color:#374151;line-height:1.6;margin-top:24px;">Log in to Curavend to review these orders and take action.</p>
  `);
}

function emailOtpTemplate(code: string, purposeLabel: string): string {
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:#1e3a5f;">Your Verification Code</h2>
    <p style="color:#374151;line-height:1.6;">Use the code below to ${escapeHtml(purposeLabel)}. This code expires in 10 minutes.</p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;background:#1e3a5f;color:#ffffff;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 32px;border-radius:8px;font-family:monospace;">${escapeHtml(code)}</span>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.5;">If you did not request this code, you can safely ignore this email.</p>
  `);
}

function parseArr(json?: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.toLowerCase()))).filter(Boolean);
}

/**
 * Simple HTML escape to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
