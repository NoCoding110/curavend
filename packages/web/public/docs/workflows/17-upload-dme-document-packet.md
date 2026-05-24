# Workflow 17 — Upload the DME Document Packet

## At a glance

| | |
|---|---|
| **What** | Fill in every required clinical / administrative document for a DME order so the packet is complete and the claim bundle can be generated. |
| **Persona** | Hospital intake / discharge staff. Provider portal users can also upload (for DWOs or LMNs they signed). |
| **Prerequisites** | An open DME order (created via the [DME wizard](../features/21-dme-order-wizard.md)) with a populated **DME Document Packet** section. |
| **Estimated time** | 1-3 minutes per document; 5-15 minutes for a full packet. |

---

## Steps

### A — Open the order

1. From the sidebar pick **Orders** → `/supply-orders`. Find the order (filter by status `PENDING` or by patient MRN).
2. Click into it → `/supply-orders/{id}`.
3. Scroll to the **DME Document Packet** section (below the line items, above the shipments strip).

   ![Step 3](../images/wf-upload-dme-document-packet-step-3.png)

   🛈 **What you're looking at.** Each row is a document required for this order's HCPCs × payor combination. Materialized at order create. The progress bar at the top tracks `RECEIVED ÷ required` — only `RECEIVED` rows count.

### B — Upload a document (the common case)

4. On a row in `MISSING` state, click **Upload**. A modal opens.

   ![Step 4](../images/wf-upload-dme-document-packet-step-4.png)

5. Fill the required fields:
   - **Signed date** — the date on the document (NOT today). For an F2F note, the actual encounter date. For a sleep study, the study date.
   - **Signed by** — name + role of the person who signed (e.g. *"Dr. Jane Smith, MD"*).
   - **Notes** (optional) — anything billing should know (*"Patient declined to sign — verbal consent witnessed"*).
6. Drag your PDF or image (PNG / JPG) into the upload zone, or click **Browse**. The file uploads to R2 with a live progress bar.

   ![Step 6](../images/wf-upload-dme-document-packet-step-6.png)

7. Click **Save**. The row flips `MISSING → RECEIVED`. The expiration date is computed and shown (signed date + the requirement's `expires_days` — e.g. 12 months for a sleep study).

### C — Attest (paper-only documents)

Some documents — typically AOBs and short clinic memos — live as paper in the patient chart. You don't have a PDF to upload; you're just attesting that the paper exists.

8. On a `MISSING` row, click **Attest** (the secondary button beside Upload).
9. Fill **Signed date**, **Signed by**, and an attestation note (e.g. *"AOB on file in patient chart, page 3"*). No file is attached.
10. Click **Save**. The row flips to `RECEIVED` with a small "attested only" icon — auditors can see no file was uploaded.

### D — Reject a document

If billing reviews a doc and finds it bad (wrong patient, illegible, not signed):

11. On a `RECEIVED` row, click **Reject**.
12. Pick a reason from the dropdown (WRONG_PATIENT / ILLEGIBLE / UNSIGNED / EXPIRED / OTHER) and add a note.
13. Click **Confirm**. The row flips to `REJECTED`. The original file is kept (for audit) but a **Re-upload** button appears so staff can correct.

   ⚠ Rejecting is a per-document operation — it does NOT cancel the order or notify the supplier. Use the order chat for that.

### E — Add an ad-hoc document

For something not on the standard checklist (e.g. a payor-specific addendum, a state-mandated form):

14. Click **Add ad-hoc doc** in the packet header.
15. Pick a **Document type** (any of the 13 enumerated types; `OTHER` for true one-offs) and a **Label**.
16. Continue with the same Upload or Attest flow as above.

   The new row appears at the bottom of the packet table tagged **Ad-hoc**.

---

## What happens behind the scenes

- **Upload** → `POST /api/dme-documents/:rowId/upload`. The Worker streams the file to R2 (`curavend-uploads/dme-orders/{orderId}/{rowId}/{filename}`), then PUTs the row with `blob_key`, `signed_at`, `signed_by`, computes `expires_at = signed_at + requirement.expires_days`, and sets status `RECEIVED`.
- **Attest** → `POST /api/dme-documents/:rowId/attest`. Same status flip, no file.
- **Reject** → `POST /api/dme-documents/:rowId/reject` with `{reason, notes}`.
- **Ad-hoc** → `POST /api/dme-documents/:orderId/ad-hoc` inserts a new row with `requirement_id=NULL` (so the expiration calc uses a hardcoded 12-month default, or NULL for permanent docs).
- Every status change writes to the order's history log so the order detail's Activity tab shows who uploaded what when.

---

## Verification

1. The packet progress bar in the header increments. When 100%, the alert flips green: *"Packet complete — claim bundle ready"*.
2. Each row you handled shows the correct status badge and an updated **Last updated** timestamp.
3. Click **View** on a `RECEIVED` row — a short-lived R2 download URL opens the file in a new tab.
4. The order's Activity tab shows entries like *"Jane Smith uploaded SLEEP_STUDY"*.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Upload modal hangs at 99%** | File > 25 MB (R2 single-part upload limit on the Worker free tier) | Compress the PDF (Adobe / ghostscript) or split it. |
| **"Signed date cannot be in the future"** | Typo, or you picked today thinking you should | Use the actual date on the document, not the date of upload. |
| **Expiration date looks wrong** | Requirement's `expires_days` is set conservatively per LCD | Override is admin-only — open `/admin/dme-documents` and edit the requirement row. |
| **Row stuck in `MISSING` after upload** | Network drop mid-upload — row was created but blob_key wasn't stamped | Click **Upload** again; the second attempt overwrites the partial row. |
| **Can't reject — no Reject button** | You only have `orders: READ` | Need `orders: WRITE` to reject. |
| **Ad-hoc row I added doesn't count toward progress** | Ad-hoc rows are excluded from the "required" denominator | This is by design — only catalog rows are "required". |

---

## Related

- Feature reference: [`features/22-dme-document-packet.md`](../features/22-dme-document-packet.md), [`features/21-dme-order-wizard.md`](../features/21-dme-order-wizard.md), [`features/25-dwo-claim-bundle.md`](../features/25-dwo-claim-bundle.md)
- Adjacent workflows: [`16-create-dme-order-end-to-end.md`](./16-create-dme-order-end-to-end.md), [`18-generate-dme-claim-bundle.md`](./18-generate-dme-claim-bundle.md)
- Persona: [`personas/hospital.md`](../personas/hospital.md)
