/**
 * General Ledger service.
 *
 * Posts balanced journal entries to `gl_entries`. Every transaction emits
 * TWO rows (debit + credit) with the same `transactionId`. Source types:
 *
 *   PO_COMMIT       — DR commitment-account 4900-COMMIT  / CR commitment-offset 4901-COMMIT-OFFSET
 *   GR_RECEIPT      — DR inventory-account  1300-INV      / CR commitment 4900-COMMIT
 *   INVOICE_APPROVE — DR expense glCode (from dept)        / CR accounts-payable 2100-AP
 *   INVOICE_PAY     — DR accounts-payable 2100-AP          / CR cash 1100-CASH
 *
 * Account codes are conventions, NOT enforced against a chart of accounts
 * table. Each hospital can override via dept.glCode (used as the expense
 * account on INVOICE_APPROVE).
 *
 * The dashboard / ERP export pulls from gl_entries; `exportedAt` is stamped
 * when a row is shipped to NetSuite/SAP/QuickBooks via the existing ERP
 * connector framework.
 */
import { getDb } from '../lib/db';
import { glEntries, hospitalDepartments, purchaseOrders } from '@curavend/db';
import { eq } from 'drizzle-orm';

function fiscalPeriodOf(d: Date): { year: number; period: string } {
  return {
    year: d.getFullYear(),
    period: 'M' + String(d.getMonth() + 1).padStart(2, '0'),
  };
}

async function deptMeta(d1: D1Database, departmentId: string | null | undefined) {
  if (!departmentId) return { costCenter: null as string | null, glCode: null as string | null };
  const db = getDb(d1);
  const [d] = await db
    .select()
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.id, departmentId))
    .limit(1);
  return {
    costCenter: d?.costCenter ?? null,
    glCode: d?.glCode ?? null,
  };
}

async function postPair(
  d1: D1Database,
  args: {
    hospitalId: string;
    departmentId?: string | null;
    debitAccount: string;
    creditAccount: string;
    amountUsd: number;
    sourceType: string;
    sourceId: string;
    memo: string;
    postedByUserId?: string;
  },
) {
  const db = getDb(d1);
  const meta = await deptMeta(d1, args.departmentId);
  const { year, period } = fiscalPeriodOf(new Date());
  const txnId = crypto.randomUUID();
  const postedAt = new Date().toISOString();
  const base = {
    transactionId: txnId,
    hospitalId: args.hospitalId,
    fiscalYear: year,
    fiscalPeriod: period,
    costCenter: meta.costCenter,
    departmentId: args.departmentId ?? null,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    memo: args.memo,
    postedAt,
    postedByUserId: args.postedByUserId ?? null,
    exportedAt: null,
  };
  await db.insert(glEntries).values([
    {
      id: crypto.randomUUID(),
      ...base,
      accountCode: args.debitAccount,
      debitUsd: args.amountUsd,
      creditUsd: 0,
    },
    {
      id: crypto.randomUUID(),
      ...base,
      accountCode: args.creditAccount,
      debitUsd: 0,
      creditUsd: args.amountUsd,
    },
  ]);
  return txnId;
}

/** Post the encumbrance journal when a PO is committed (transmitted). */
export async function postPoCommit(
  d1: D1Database,
  poId: string,
  postedByUserId?: string,
): Promise<string | null> {
  const db = getDb(d1);
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po || !po.totalUsd || !po.hospitalId) return null;
  return postPair(d1, {
    hospitalId: po.hospitalId,
    debitAccount: '4900-COMMIT',
    creditAccount: '4901-COMMIT-OFFSET',
    amountUsd: po.totalUsd,
    sourceType: 'PO_COMMIT',
    sourceId: poId,
    memo: `PO ${po.number} committed`,
    postedByUserId,
  });
}

/** Post the inventory-receipt journal when goods are received. */
export async function postGrReceipt(
  d1: D1Database,
  args: {
    hospitalId: string;
    grId: string;
    poId?: string;
    departmentId?: string | null;
    amountUsd: number;
    memo?: string;
    postedByUserId?: string;
  },
): Promise<string> {
  return postPair(d1, {
    hospitalId: args.hospitalId,
    departmentId: args.departmentId,
    debitAccount: '1300-INV',
    creditAccount: '4900-COMMIT',
    amountUsd: args.amountUsd,
    sourceType: 'GR_RECEIPT',
    sourceId: args.grId,
    memo: args.memo ?? `Receipt for ${args.poId ?? 'order'}`,
    postedByUserId: args.postedByUserId,
  });
}

/** Post the expense+AP journal when an invoice is approved. */
export async function postInvoiceApprove(
  d1: D1Database,
  args: {
    hospitalId: string;
    invoiceId: string;
    departmentId?: string | null;
    amountUsd: number;
    memo?: string;
    postedByUserId?: string;
  },
): Promise<string> {
  // The expense account is the dept's glCode if set, else the generic expense bucket.
  const meta = await deptMeta(d1, args.departmentId);
  const debit = meta.glCode ?? '5000-EXPENSE';
  return postPair(d1, {
    hospitalId: args.hospitalId,
    departmentId: args.departmentId,
    debitAccount: debit,
    creditAccount: '2100-AP',
    amountUsd: args.amountUsd,
    sourceType: 'INVOICE_APPROVE',
    sourceId: args.invoiceId,
    memo: args.memo ?? `Invoice ${args.invoiceId.slice(0, 8)} approved`,
    postedByUserId: args.postedByUserId,
  });
}

/** Post the cash-out journal when an invoice is paid. */
export async function postInvoicePay(
  d1: D1Database,
  args: {
    hospitalId: string;
    invoiceId: string;
    amountUsd: number;
    memo?: string;
    postedByUserId?: string;
  },
): Promise<string> {
  return postPair(d1, {
    hospitalId: args.hospitalId,
    debitAccount: '2100-AP',
    creditAccount: '1100-CASH',
    amountUsd: args.amountUsd,
    sourceType: 'INVOICE_PAY',
    sourceId: args.invoiceId,
    memo: args.memo ?? `Invoice ${args.invoiceId.slice(0, 8)} paid`,
    postedByUserId: args.postedByUserId,
  });
}
