/**
 * xlsxService — Excel report generation via `exceljs`.
 * Returns `Uint8Array` byte buffers suitable for HTTP responses.
 */
import ExcelJS from 'exceljs';

export interface OrderReportRow {
  orderId: string;
  identifier?: string | null;
  patientName?: string | null;
  status?: string | null;
  subStatus?: string | null;
  vendorName?: string | null;
  hospitalName?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  totalAmount?: number | null;
  createdAt?: string | null;
}

export async function generateOrderTrackingReport(
  rows: OrderReportRow[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Curavend';
  wb.created = new Date();
  const ws = wb.addWorksheet('Orders');
  ws.columns = [
    { header: 'Order #', key: 'identifier', width: 18 },
    { header: 'Patient', key: 'patientName', width: 22 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Sub-status', key: 'subStatus', width: 24 },
    { header: 'Vendor', key: 'vendorName', width: 24 },
    { header: 'Hospital', key: 'hospitalName', width: 24 },
    { header: 'Carrier', key: 'carrier', width: 12 },
    { header: 'Tracking #', key: 'trackingNumber', width: 24 },
    { header: 'Shipped At', key: 'shippedAt', width: 22 },
    { header: 'Delivered At', key: 'deliveredAt', width: 22 },
    { header: 'Total $', key: 'totalAmount', width: 12 },
    { header: 'Created At', key: 'createdAt', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1BAEE5' },
  };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rows.forEach((row) => ws.addRow(row));
  ws.autoFilter = { from: 'A1', to: 'L1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export interface InvoiceReportRow {
  invoiceNumber?: string | null;
  status?: string | null;
  hospitalName?: string | null;
  vendorName?: string | null;
  totalAmount?: number | null;
  issuedAt?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
}

export async function generateInvoiceReport(
  rows: InvoiceReportRow[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Invoices');
  ws.columns = [
    { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Hospital', key: 'hospitalName', width: 24 },
    { header: 'Vendor', key: 'vendorName', width: 24 },
    { header: 'Total', key: 'totalAmount', width: 14 },
    { header: 'Issued', key: 'issuedAt', width: 22 },
    { header: 'Due', key: 'dueDate', width: 22 },
    { header: 'Paid', key: 'paidAt', width: 22 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1BAEE5' },
  };
  rows.forEach((row) => ws.addRow(row));
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export interface SpendRow {
  groupKey: string;
  totalAmount: number;
  orderCount: number;
}

export async function generateSpendReport(
  rows: SpendRow[],
  groupBy: 'vendor' | 'hcpc' | 'month',
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Spend by ${groupBy}`);
  ws.columns = [
    { header: groupBy === 'vendor' ? 'Vendor' : groupBy === 'hcpc' ? 'HCPC' : 'Month', key: 'groupKey', width: 28 },
    { header: 'Total Spend', key: 'totalAmount', width: 16 },
    { header: 'Order Count', key: 'orderCount', width: 14 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1BAEE5' },
  };
  rows.forEach((row) => ws.addRow(row));
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export interface LabOrderReportRow {
  orderNumber: string;
  patientName?: string | null;
  status: string;
  testCount: number;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export async function generateLabOrderTrackingReport(
  rows: LabOrderReportRow[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lab Orders');
  ws.columns = [
    { header: 'Order #', key: 'orderNumber', width: 18 },
    { header: 'Patient', key: 'patientName', width: 22 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Test Count', key: 'testCount', width: 12 },
    { header: 'Carrier', key: 'carrier', width: 12 },
    { header: 'Tracking #', key: 'trackingNumber', width: 24 },
    { header: 'Shipped At', key: 'shippedAt', width: 22 },
    { header: 'Delivered At', key: 'deliveredAt', width: 22 },
    { header: 'Created At', key: 'createdAt', width: 22 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1BAEE5' },
  };
  rows.forEach((row) => ws.addRow(row));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
