#!/usr/bin/env bash
# ============================================================================
# UAT script: PENDING_APPROVAL order approval flow (Finding #4 smoke test)
#
# Prerequisites:
#   1. TURNSTILE_SKIP_SECRET must be configured on the target environment
#      (or use the Cloudflare test-mode secret key in that env):
#        wrangler secret put TURNSTILE_SKIP_SECRET --env preview
#      Then export TURNSTILE_SKIP_SECRET=<value> in this shell before running.
#
#   2. An approval rule must exist that matches the test order so the
#      send-for-approval route has someone to route to. The seed data
#      includes a catch-all rule for ACCOUNT_MANAGER users, so admin
#      credentials satisfy this automatically.
#
#   3. Requires: curl, jq
#
# Usage:
#   export API_BASE=https://curavend-api.metabilityllc1.workers.dev
#   export TURNSTILE_SKIP_SECRET=<your-preview-skip-secret>
#   bash packages/api/scripts/uat-approval-flow.sh
# ============================================================================

set -euo pipefail

API_BASE="${API_BASE:-https://curavend-api.metabilityllc1.workers.dev}"
SKIP_SECRET="${TURNSTILE_SKIP_SECRET:-}"

if [[ -z "$SKIP_SECRET" ]]; then
  echo "ERROR: TURNSTILE_SKIP_SECRET is not set. Export it before running."
  echo "  export TURNSTILE_SKIP_SECRET=<value>"
  echo "  Or set TURNSTILE_SECRET_KEY to Cloudflare test-mode key in the worker env."
  exit 1
fi

echo "=== UAT: PENDING_APPROVAL approval flow ==="
echo "Target: $API_BASE"
echo ""

# ─── Step 1: Login as admin ──────────────────────────────────────────────────
echo "[1] Logging in as admin@curavend.com ..."
LOGIN=$(curl -sf -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-turnstile-skip: $SKIP_SECRET" \
  -d '{"email":"admin@curavend.com","password":"Admin@123"}')

ADMIN_TOKEN=$(echo "$LOGIN" | jq -r '.accessToken // .token // empty')
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: Login did not return an accessToken."
  echo "$LOGIN" | jq .
  exit 1
fi
echo "  -> Got admin token (${#ADMIN_TOKEN} chars) ✓"
echo ""

# ─── Step 2: Get a hospital + vendor ID from existing data ───────────────────
echo "[2] Fetching a hospital and vendor from live data ..."
HOSPITALS=$(curl -sf "$API_BASE/api/hospitals?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
HOSPITAL_ID=$(echo "$HOSPITALS" | jq -r '.items[0].id // empty')
if [[ -z "$HOSPITAL_ID" ]]; then
  echo "FAIL: No hospitals found."
  exit 1
fi
echo "  -> hospitalId: $HOSPITAL_ID ✓"

VENDORS=$(curl -sf "$API_BASE/api/vendors?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
VENDOR_ID=$(echo "$VENDORS" | jq -r '.items[0].id // empty')
if [[ -z "$VENDOR_ID" ]]; then
  echo "FAIL: No vendors found."
  exit 1
fi
echo "  -> vendorId: $VENDOR_ID ✓"
echo ""

# ─── Step 3: Create a new order ──────────────────────────────────────────────
echo "[3] Creating a new order ..."
CREATE=$(curl -sf -X POST "$API_BASE/api/orders" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"hospitalId\": \"$HOSPITAL_ID\",
    \"vendorId\": \"$VENDOR_ID\",
    \"patientName\": \"UAT Patient\",
    \"items\": [{ \"hcpcCode\": \"E0601\", \"description\": \"CPAP device\", \"quantity\": 1 }]
  }")

ORDER_ID=$(echo "$CREATE" | jq -r '.id // empty')
if [[ -z "$ORDER_ID" ]]; then
  echo "FAIL: Order creation failed."
  echo "$CREATE" | jq .
  exit 1
fi
echo "  -> Created orderId: $ORDER_ID ✓"
echo ""

# ─── Step 4: Check current sub-status is NEW_ORDER ──────────────────────────
echo "[4] Verifying initial sub-status is NEW_ORDER ..."
ORDER=$(curl -sf "$API_BASE/api/orders/$ORDER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
SUB_STATUS=$(echo "$ORDER" | jq -r '.orderSubStatus // empty')
if [[ "$SUB_STATUS" != "NEW_ORDER" ]]; then
  echo "FAIL: Expected NEW_ORDER, got: $SUB_STATUS"
  exit 1
fi
echo "  -> orderSubStatus = $SUB_STATUS ✓"
echo ""

# ─── Step 5: Send for approval ───────────────────────────────────────────────
echo "[5] Calling send-for-approval ..."
SFA=$(curl -sf -X POST "$API_BASE/api/orders/$ORDER_ID/send-for-approval" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

NEW_SUB=$(echo "$SFA" | jq -r '.newSubStatus // empty')
if [[ "$NEW_SUB" != "PENDING_APPROVAL" ]]; then
  echo "FAIL: Expected newSubStatus=PENDING_APPROVAL, got: $NEW_SUB"
  echo "$SFA" | jq .
  exit 1
fi
APPROVER_USER_ID=$(echo "$SFA" | jq -r '.approverUserId // "none"')
echo "  -> newSubStatus = $NEW_SUB ✓"
echo "  -> approverUserId = $APPROVER_USER_ID ✓"
echo ""

# ─── Step 6: Confirm DB sub-status via API ───────────────────────────────────
echo "[6] Re-fetching order to confirm DB persisted PENDING_APPROVAL ..."
ORDER2=$(curl -sf "$API_BASE/api/orders/$ORDER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
SUB2=$(echo "$ORDER2" | jq -r '.orderSubStatus // empty')
if [[ "$SUB2" != "PENDING_APPROVAL" ]]; then
  echo "FAIL: DB shows $SUB2 not PENDING_APPROVAL"
  exit 1
fi
echo "  -> DB orderSubStatus = $SUB2 ✓"
echo ""

# ─── Step 7: Check order appears in approvals queue ─────────────────────────
echo "[7] Checking order appears in approvals queue ..."
QUEUE=$(curl -sf "$API_BASE/api/approvals/queue?type=order" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
FOUND=$(echo "$QUEUE" | jq --arg id "$ORDER_ID" '.items[] | select(.entityId == $id) | .entityId' | head -1)
if [[ -z "$FOUND" ]]; then
  echo "WARN: Order not yet in queue (approval rule may not have matched; check approval_rules table)"
else
  echo "  -> Order present in approvals queue ✓"
fi
echo ""

# ─── Step 8: Approve the order (advance PENDING_APPROVAL → VENDOR_ASSIGNED) ─
echo "[8] Approving order via POST /api/approvals/order/$ORDER_ID/approve ..."
APPROVE=$(curl -sf -X POST "$API_BASE/api/approvals/order/$ORDER_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vendorId\": \"$VENDOR_ID\"}")

if ! echo "$APPROVE" | jq -e '.success == true' > /dev/null 2>&1; then
  echo "FAIL: Approve call did not return success=true"
  echo "$APPROVE" | jq .
  exit 1
fi
echo "  -> Approve returned success=true ✓"
echo ""

# ─── Step 9: Confirm final sub-status is VENDOR_ASSIGNED ────────────────────
echo "[9] Confirming final sub-status = VENDOR_ASSIGNED ..."
ORDER3=$(curl -sf "$API_BASE/api/orders/$ORDER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
SUB3=$(echo "$ORDER3" | jq -r '.orderSubStatus // empty')
if [[ "$SUB3" != "VENDOR_ASSIGNED" ]]; then
  echo "FAIL: Expected VENDOR_ASSIGNED, got: $SUB3"
  exit 1
fi
echo "  -> DB orderSubStatus = $SUB3 ✓"
echo ""

# ─── Step 10: Confirm order_approval_meta row was written ───────────────────
echo "[10] Checking order_approval_meta sidecar row (via D1 or order detail) ..."
# The meta row is written by send-for-approval; it's not currently exposed
# directly in the GET /orders/:id response, so we check indirectly.
# If you have wrangler access, run:
#   npx wrangler d1 execute curavend-db --remote \
#     --command "SELECT * FROM order_approval_meta WHERE order_id = '$ORDER_ID'"
echo "  -> Manual check: run the wrangler command below to verify the sidecar row:"
echo "       npx wrangler d1 execute curavend-db --remote \\"
echo "         --command \"SELECT * FROM order_approval_meta WHERE order_id = '$ORDER_ID'\""
echo ""

echo "========================================"
echo "UAT RESULT: ALL AUTOMATED STEPS PASSED"
echo "  orderId:          $ORDER_ID"
echo "  NEW_ORDER         ✓"
echo "  PENDING_APPROVAL  ✓  (send-for-approval)"
echo "  VENDOR_ASSIGNED   ✓  (approve)"
echo "========================================"
