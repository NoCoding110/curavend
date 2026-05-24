#!/usr/bin/env bash
# Cross-tenant smoke test for the 10 procurement v2 routes.
#
# Why this script exists: when developing tenant-scoped routes, the safest
# verification is to call them with a token whose tenant DIFFERS from the
# resource you're trying to read/mutate. The expected response is 403/404
# in every case — never 200 with someone else's data.
#
# Usage:
#   1. Log into the app as a HOSPITAL user (hospital A). Open DevTools →
#      Application → Local Storage → grab the JWT from 'persist:root'.auth.
#   2. Note the hospitalId of hospital A. Pick a foreign hospitalId (B).
#      Optionally pick a foreign vendorId.
#   3. Run:
#        HOSP_A_TOKEN='ey...' \
#        FOREIGN_HOSPITAL_ID='hospital-B-uuid' \
#        FOREIGN_VENDOR_ID='vendor-X-uuid' \
#        bash smoke-pv2-tenant-scope.sh
#
# A clean run prints "PASS" for every test. Any 200 response with foreign
# data is reported as "FAIL" with the response body for investigation.

set -u
BASE="${BASE:-https://curavend-api.metabilityllc1.workers.dev}"
TOKEN="${HOSP_A_TOKEN:-}"
FH="${FOREIGN_HOSPITAL_ID:-}"
FV="${FOREIGN_VENDOR_ID:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: HOSP_A_TOKEN env var required" >&2
  exit 1
fi
if [[ -z "$FH" && -z "$FV" ]]; then
  echo "ERROR: at least one of FOREIGN_HOSPITAL_ID / FOREIGN_VENDOR_ID required" >&2
  exit 1
fi

pass=0
fail=0
total=0

run_test() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="${4:-}"
  total=$((total + 1))
  local args=(-s -o /tmp/pv2-resp -w "%{http_code}" -H "Authorization: Bearer $TOKEN")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  args+=(-X "$method" "$BASE$url")
  local code
  code=$(curl "${args[@]}")
  if [[ "$code" == "403" || "$code" == "404" ]]; then
    echo "  PASS  $name  ($code)"
    pass=$((pass + 1))
  elif [[ "$code" == "200" || "$code" == "201" ]]; then
    # 200 OK is a leak if the response actually contains foreign records.
    # We can't fully discriminate without parsing — emit a warning so the
    # operator can eyeball /tmp/pv2-resp manually.
    echo "  WARN  $name  ($code) -- check /tmp/pv2-resp for leaked records"
    fail=$((fail + 1))
  else
    echo "  FAIL  $name  ($code)"
    fail=$((fail + 1))
  fi
}

echo ""
echo "=== Cross-tenant smoke test (PV2 routes) ==="
echo "BASE:               $BASE"
echo "FOREIGN_HOSPITAL:   ${FH:-<unset>}"
echo "FOREIGN_VENDOR:     ${FV:-<unset>}"
echo ""

# ─── budgets ────────────────────────────────────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "GET /api/budgets?hospitalId=B (should ignore the query and use my hospital)" \
    "/api/budgets?hospitalId=$FH&fiscalYear=2026"
fi

# ─── purchase orders ────────────────────────────────────────────────────────
run_test "GET /api/purchase-orders/<bogus-id>" \
  "/api/purchase-orders/00000000-0000-0000-0000-000000000000"

# ─── vendor onboarding ──────────────────────────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "GET /api/vendor-onboarding?hospitalId=B" \
    "/api/vendor-onboarding?hospitalId=$FH"
fi

# ─── RMAs ───────────────────────────────────────────────────────────────────
if [[ -n "$FV" ]]; then
  run_test "GET /api/rmas?vendorId=X (admin filter — should be ignored for non-admin)" \
    "/api/rmas?vendorId=$FV"
fi

# ─── compliance alerts ──────────────────────────────────────────────────────
run_test "GET /api/compliance-alerts (hospital user — should only see my hospital)" \
  "/api/compliance-alerts"

# ─── point of use ───────────────────────────────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "POST /api/point-of-use {hospitalId: B} (admin-only field — non-admin must be rejected)" \
    "/api/point-of-use" POST \
    "{\"hospitalId\":\"$FH\",\"hcpcCode\":\"A4253\",\"quantity\":1}"
fi

# ─── logistics ──────────────────────────────────────────────────────────────
run_test "GET /api/logistics/shipments/<bogus-id>" \
  "/api/logistics/shipments/00000000-0000-0000-0000-000000000000"
run_test "POST /api/logistics/shipments/<bogus>/temp" \
  "/api/logistics/shipments/00000000-0000-0000-0000-000000000000/temp" POST \
  "{\"temperatureC\":4.0}"

# ─── invoice match rules ────────────────────────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "GET /api/invoice-match-rules?hospitalId=B" \
    "/api/invoice-match-rules?hospitalId=$FH"
fi

# ─── reporting ──────────────────────────────────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "GET /api/reporting/department-spend?hospitalId=B" \
    "/api/reporting/department-spend?hospitalId=$FH"
  run_test "GET /api/reporting/gl/entries?hospitalId=B" \
    "/api/reporting/gl/entries?hospitalId=$FH"
fi

# ─── item master hygiene ────────────────────────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "GET /api/item-master-hygiene/duplicates?hospitalId=B" \
    "/api/item-master-hygiene/duplicates?hospitalId=$FH"
fi

# ─── cross-site inventory ───────────────────────────────────────────────────
run_test "GET /api/reporting/cross-site-inventory (hospital user — should 403, no lab/vendor scope)" \
  "/api/reporting/cross-site-inventory"

# ─── backorders ─────────────────────────────────────────────────────────────
run_test "GET /api/backorders/triage" \
  "/api/backorders/triage"

# ═══════════════════════════════════════════════════════════════════════════
# PV3 routes
# ═══════════════════════════════════════════════════════════════════════════

# ─── inventory transfers ────────────────────────────────────────────────────
run_test "GET /api/transfers (hospital-scoped)" \
  "/api/transfers"
run_test "GET /api/transfers/<bogus>" \
  "/api/transfers/00000000-0000-0000-0000-000000000000"

# ─── recalls (read-only allowed for admin/compliance, write admin-only) ─────
run_test "GET /api/recalls" \
  "/api/recalls"

# ─── controlled substance ───────────────────────────────────────────────────
run_test "GET /api/controlled-substance/log (hospital-scoped)" \
  "/api/controlled-substance/log"

# ─── substitutions audit ────────────────────────────────────────────────────
run_test "GET /api/substitutions (hospital-scoped)" \
  "/api/substitutions"

# ─── procurement analytics (hospital-scoped) ────────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "GET /api/reporting/charge-capture-leakage?hospitalId=B (foreign hospital — should ignore)" \
    "/api/reporting/charge-capture-leakage?hospitalId=$FH"
  run_test "GET /api/reporting/price-variance?hospitalId=B" \
    "/api/reporting/price-variance?hospitalId=$FH"
  run_test "GET /api/reporting/clinical-consumption?hospitalId=B" \
    "/api/reporting/clinical-consumption?hospitalId=$FH"
  run_test "GET /api/reporting/hospital-forecast?hospitalId=B" \
    "/api/reporting/hospital-forecast?hospitalId=$FH"
fi
run_test "GET /api/reporting/vendor-scorecard (hospital-scoped)" \
  "/api/reporting/vendor-scorecard"

# ─── emergency review queue (hospital-scoped) ───────────────────────────────
run_test "GET /api/requisitions/emergency-review-queue" \
  "/api/requisitions/emergency-review-queue"

# ─── controlled substance event (POST guarded) ──────────────────────────────
if [[ -n "$FH" ]]; then
  run_test "POST /api/controlled-substance/event {hospitalId: B} (foreign — non-admin should be rejected)" \
    "/api/controlled-substance/event" POST \
    "{\"hospitalId\":\"$FH\",\"hcpcCode\":\"J3010\",\"deaSchedule\":\"II\",\"eventType\":\"DISPENSE\",\"quantity\":-1,\"witnessedByUserId\":\"someone\"}"
fi

echo ""
echo "=== Result ==="
echo "  Total:  $total"
echo "  Pass:   $pass"
echo "  Warn:   $fail   (200/201 responses — eyeball the body)"
echo ""
if [[ "$fail" -gt 0 ]]; then
  echo "Note: a '200' isn't automatically a leak. The /triage and"
  echo "      /backorders endpoints return your OWN hospital's rows (expected)."
  echo "      The WARN flag exists for endpoints where a foreign hospitalId query"
  echo "      arg SHOULD be ignored — verify the response doesn't contain"
  echo "      records from the other hospital."
fi
