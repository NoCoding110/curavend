# Workflow 18 — Generate a DME Claim Bundle

## At a glance

| | |
|---|---|
| **What** | Produce the single merged PDF (DWO + every received document + PA approval letter + delivery POD) that gets submitted to the payor's claim portal. Also covers downloading the DWO alone for physician e-signature before the order ships. |
| **Persona** | Hospital billing staff (`FACILITY_ACCOUNT_MANAGER_USER` with `orders: READ`). Provider portal users can also download the DWO for sign-off. |
| **Prerequisites** | For a full claim bundle: every required document `RECEIVED`, every PA in state `APPROVED`, delivery POD attached to the order shipment. For DWO-only: just the wizard sidecar (created at order finalize). |
| **Estimated time** | < 1 minute. |

---

## Steps

### Path 1 — DWO-only download (pre-shipment, for physician e-sign)

1. Open the order at `/supply-orders/{id}`. Scroll to the **DME Document Packet** section.
2. In the section header, click **DWO PDF**.

   ![Step 2](../images/wf-generate-dme-claim-bundle-step-2.png)

3. A new tab opens streaming `/api/dme-bundle/{orderId}/dwo.pdf`. The Worker renders the DWO HTML via Browser Rendering and pipes the resulting PDF straight to your browser.
4. **Save** the PDF, attach it to your usual physician e-signature workflow (DocuSign, internal e-sig, fax, etc.).
5. When the signed copy comes back, upload it as the `DWO` document type in the packet (see [Workflow 17](./17-upload-dme-document-packet.md)). The unsigned auto-generated DWO is replaced by the signed one for billing.

   🛈 **Why generate an unsigned DWO at all?** It saves the prescriber from typing the 7 CMS-required elements manually. They just review, sign, and return.

### Path 2 — Full claim bundle (post-delivery, for payor submission)

#### A — Confirm readiness

6. In the packet header, verify the green alert: *"Packet complete — claim bundle ready"*. If you see an orange or red alert, the bundle is not yet claim-ready — go finish what's missing first.

   ![Step 6](../images/wf-generate-dme-claim-bundle-step-6.png)

7. Check the order's **Prior Auths** strip (if present). Every PA should show state `APPROVED` with an approval document attached. If a PA is `PENDING`, the bundle WILL still generate but won't include that PA's approval letter — payor will likely deny.
8. Check the order's **Shipments** strip. The latest shipment should have a **Proof of Delivery** uploaded (patient-signed slip from the supplier). Without it, the bundle skips the POD page.

#### B — Click the button

9. In the packet header, click **Claim bundle**.

   ![Step 9](../images/wf-generate-dme-claim-bundle-step-9.png)

10. If anything is incomplete, a confirm dialog warns you with a missing-items list. You can:
    - **Cancel** and go fix the missing pieces, or
    - **Generate anyway** (admin-only) to produce a partial bundle for diagnostic purposes.
11. A new tab opens streaming `/api/dme-bundle/{orderId}/claim-bundle.pdf`. The Worker:
    - Renders the DWO via Browser Rendering.
    - Reads every `RECEIVED` document from R2.
    - Reads every PA approval letter and the POD blob.
    - Converts any PNG / JPG to single-page PDF via `imageToPdf`.
    - Merges everything in a fixed order via `pdf-lib`.
    - Streams the final PDF with filename `{orderNumber}-claim-bundle.pdf`.

#### C — Submit to payor

12. **Save** the merged PDF locally with your usual naming convention.
13. Upload to the payor's claim portal (Medicare PDAC, BCBS Availity, etc.) per your billing playbook.
14. Record the payor's claim number in the order's **Notes** field for future cross-reference. (A first-class "claim number" column is on the roadmap.)

---

## What happens behind the scenes

### DWO render

- `GET /api/dme-bundle/:orderId/dwo.pdf` → `dmeBundle.ts` route loads `orders`, `order_items`, `dme_order_extensions`, and the prescriber contact, calls `renderDwoHtml(...)` from `dmeDwoTemplate.ts` → HTML → `renderHtmlToPdf(c.env.BROWSER, html)` → PDF bytes streamed back.
- All 7 CMS-required DWO elements are baked into the template (beneficiary, items + HCPC, prescriber + NPI, date of order, signature line, reason, length of need). See [`features/25-dwo-claim-bundle.md`](../features/25-dwo-claim-bundle.md).

### Claim bundle merge

- `GET /api/dme-bundle/:orderId/claim-bundle.pdf` → same data load, then:
  1. Build the DWO PDF (in memory).
  2. Query `dme_order_documents` where `status='RECEIVED'`, ordered by document type for predictable layout.
  3. Query `prior_auths` for this order where `state='APPROVED'` and `approval_document_blob_key IS NOT NULL`.
  4. Query `order_shipments` for the latest one with `proof_of_delivery_blob_key`.
  5. Fetch each blob from R2 in parallel.
  6. For each blob, sniff the content type — PDFs pass through, images get wrapped via `imageToPdf()` (single-page PDF at Letter size, 0.5" margin).
  7. Concatenate with `mergePdfs(pdf-lib)`.
  8. Stream the result with `Content-Disposition: attachment; filename="{orderNumber}-claim-bundle.pdf"`.

- A row is appended to `phi_access_log` with `action=DOWNLOAD_CLAIM_BUNDLE` for HIPAA audit.

---

## Verification

1. The downloaded PDF opens. Page 1 is the DWO with the patient's name and HCPC list visible.
2. Subsequent pages match the packet rows you uploaded — Face-to-Face note, sleep study, oximetry, etc.
3. PA approval letter pages appear after the clinical docs.
4. The final page is the patient-signed POD (if present).
5. The order's Activity tab shows *"{Your name} downloaded claim bundle at {timestamp}"*.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **DWO renders blank physician name** | The order has no clinical contact with `npi` filled | Edit the order's contacts, add a clinical contact with NPI, then re-download. |
| **Claim bundle is missing pages** | One of the source blobs is corrupt or > 100 MB | Open `/admin/integration-log`, look for `claim-bundle.merge` warnings — the offending blob name will be in the log. Re-upload that document. |
| **PDF won't open in payor portal** | Some old payor portals reject PDFs > 50 MB | Strip wound photos from the packet (reject + re-attest with note), regenerate. |
| **"Generate anyway" not visible** | You're not an admin | A non-admin must wait for the packet to be complete. Ask an admin to override or finish the packet. |
| **Browser Rendering returns 503** | Cloudflare Browser Rendering binding temporarily unavailable (rare) | Wait a minute and retry — there's no caching, every call is fresh. |
| **POD not included in bundle** | `order_shipments.proof_of_delivery_blob_key` is NULL on the latest shipment | Upload the POD on the shipment row, then regenerate. |

---

## Related

- Feature reference: [`features/25-dwo-claim-bundle.md`](../features/25-dwo-claim-bundle.md), [`features/22-dme-document-packet.md`](../features/22-dme-document-packet.md), [`features/21-dme-order-wizard.md`](../features/21-dme-order-wizard.md)
- Adjacent workflows: [`16-create-dme-order-end-to-end.md`](./16-create-dme-order-end-to-end.md), [`17-upload-dme-document-packet.md`](./17-upload-dme-document-packet.md), [`08-process-prior-authorization.md`](./08-process-prior-authorization.md)
- Persona: [`personas/hospital.md`](../personas/hospital.md)
