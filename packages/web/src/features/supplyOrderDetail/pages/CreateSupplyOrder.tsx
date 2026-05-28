import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Form,
  Input,
  Select,
  DatePicker,
  Steps,
  Divider,
  Table,
  Descriptions,
  message,
  InputNumber,
  Spin,
  Alert,
  Tag,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckOutlined,
  UserOutlined,
  FileTextOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { get, post } from '../../../api/client';
import { customerPurchaseOrdersApi, type CustomerPurchaseOrder } from '../../../api/customerPurchaseOrders';
import { useResizableColumns } from '../../../components/table/useResizableColumns';
import RoutingPickerCell from '../components/RoutingPickerCell';
import { useFhirLaunchContext } from '../../../hooks/useFhirLaunchContext';
import { fhirApi, type LaunchContextPrefill } from '../../../api/fhirContext';
import FromEpicBadge from '../components/FromEpicBadge';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const PageWrapper = styled.div`
  padding: 24px;
`;

const StepContent = styled.div`
  margin-top: 24px;
  min-height: 400px;
`;

const FormCard = styled(Card)`
  border-radius: 12px;
`;

const ReviewSection = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

interface Hospital {
  id: string;
  name: string;
}

interface Vendor {
  id: string;
  name: string;
}

interface Facility {
  id: string;
  name: string;
  number: string | null;
  state?: string | null;
  zip?: string | null;
}

interface Department {
  id: string;
  name: string;
  number: string | null;
  facilityId: string | null;
}

interface Physician {
  id: string;
  name: string;
  npiNumber: string | null;
}

interface HcpcItem {
  key: string;
  code: string;
  description: string;
  quantity: number;
}

interface RoutingLocationCandidate {
  vendorId: string;
  vendorName: string | null;
  locationId: string;
  locationName: string;
  locationState: string | null;
  locationType: string;
  maxDeliveryHours: number | null;
  capabilities: string[];
  serviceStates: string[];
  score: number;
  priority: number;
  reasons: string[];
}

interface RoutingSuggestion {
  itemKey: string;
  category: string;
  recommended: RoutingLocationCandidate | null;
  alternatives: RoutingLocationCandidate[];
  errors: string[];
}

interface RoutingResponse {
  facilityId: string;
  facilityState: string | null;
  suggestions: RoutingSuggestion[];
  splitRequired: boolean;
  groupedByVendor: Record<string, string[]>; // vendorId → itemKey[]
  unroutable: string[]; // itemKey[]
}

const STEPS = [
  { title: 'Patient Info', icon: <UserOutlined /> },
  { title: 'Order Details', icon: <FileTextOutlined /> },
  { title: 'Review & Submit', icon: <EyeOutlined /> },
];

// sessionStorage key for draft persistence
const DRAFT_KEY = 'curavend_create_order_draft';

const saveDraft = (data: object) => {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* quota exceeded, ignore */ }
};

const clearDraft = () => {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
};

const loadDraft = (): Record<string, any> | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const CreateSupplyOrder: React.FC = () => {
  const navigate = useNavigate();
  const userData = useSelector((state: RootState) => state.auth.userData);

  // Load persisted draft on first render
  const draft = loadDraft();

  const [currentStep, setCurrentStep] = useState<number>(draft?.currentStep ?? 0);
  const [patientForm] = Form.useForm();
  const [orderForm] = Form.useForm();
  const [searchParams] = useSearchParams();
  const fhirCtx = useFhirLaunchContext();
  /** Epic FHIR pre-fill state — null until launch context resolves. */
  const [epicPrefill, setEpicPrefill] = useState<{
    status: 'idle' | 'loading' | 'loaded' | 'error';
    data?: LaunchContextPrefill;
    error?: string;
  }>({ status: 'idle' });
  const [loading, setLoading] = useState(false);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(draft?.selectedFacilityId ?? null);
  const [hcpcItems, setHcpcItems] = useState<HcpcItem[]>(
    draft?.hcpcItems ?? [{ key: '1', code: '', description: '', quantity: 1 }]
  );
  const [hcpcOptions, setHcpcOptions] = useState<Record<string, any[]>>({});
  const [hcpcLoading, setHcpcLoading] = useState<Record<string, boolean>>({});
  // Formulary decisions per HCPC row (Feature 7 integration)
  const [formularyDecisions, setFormularyDecisions] = useState<
    Record<string, {
      decision: 'ON_FORMULARY' | 'OFF_FORMULARY' | 'RESTRICTED';
      maxPrice: number | null;
      preferredVendorId: string | null;
      substitutes: Array<{
        substituteHcpcCode: string;
        substituteDescription: string | null;
        priority: number;
      }>;
    } | null>
  >({});
  const lookupFormulary = async (itemKey: string, code: string) => {
    if (!code) {
      setFormularyDecisions((s) => ({ ...s, [itemKey]: null }));
      return;
    }
    try {
      const { get } = await import('../../../api/client');
      const r = await get<{ decision: string; item: any; substitutes?: any[] }>(
        `/formulary/resolve`, { hcpcCode: code },
      );
      setFormularyDecisions((s) => ({
        ...s,
        [itemKey]: {
          decision: r.decision as any,
          maxPrice: r.item?.maxUnitPriceUsd ?? null,
          preferredVendorId: r.item?.preferredVendorId ?? null,
          substitutes: Array.isArray(r.substitutes) ? r.substitutes : [],
        },
      }));
    } catch {
      // user may lack hospital context (e.g. admin without explicit hospitalId) — silently skip
      setFormularyDecisions((s) => ({ ...s, [itemKey]: null }));
    }
  };

  // One-click swap: write a substitution_audit_log row, then replace the
  // row's HCPC + re-run the formulary lookup. Backend enforces a governance
  // gate — ad-hoc swaps require an approverUserId, which we prompt for on
  // demand. Audit failures abort the swap (no silent rewrites).
  const swapToSubstitute = async (
    itemKey: string,
    sub: { substituteHcpcCode: string; substituteDescription: string | null },
  ) => {
    const fromHcpc = hcpcItems.find((it) => it.key === itemKey)?.code;
    if (!fromHcpc) return;
    const { post } = await import('../../../api/client');
    const { message } = await import('antd');

    const writeLog = async (approverUserId?: string) => post('/substitutions/log', {
      fromHcpcCode: fromHcpc,
      toHcpcCode: sub.substituteHcpcCode,
      contextType: 'ORDER_CREATE',
      contextId: savedOrder?.id ?? null,
      reason: 'Substitute chip clicked in wizard',
      approverUserId,
    });

    try {
      await writeLog();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? '';
      if (msg.includes('approved-substitutes')) {
        const approverId = window.prompt(
          `${sub.substituteHcpcCode} is not pre-approved for ${fromHcpc}. ` +
          `Enter the approving user's ID to record this ad-hoc swap:`,
        )?.trim();
        if (!approverId) return; // user bailed
        try {
          await writeLog(approverId);
        } catch (err2: any) {
          message.error(err2?.response?.data?.error ?? 'Audit log failed');
          return;
        }
      } else {
        message.error(msg || 'Audit log failed');
        return;
      }
    }

    // Audit succeeded → perform the swap.
    setHcpcItems((items) =>
      items.map((it) =>
        it.key === itemKey
          ? { ...it, code: sub.substituteHcpcCode, description: sub.substituteDescription ?? it.description }
          : it,
      ),
    );
    void lookupFormulary(itemKey, sub.substituteHcpcCode);
  };
  const hcpcTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Wizard-routing check: ask the API to categorize every HCPC the user
  // has entered, and recommend the right wizard. Surfaces a banner when
  // the user's lines need the DME wizard's stricter regulatory flow.
  const [wizardRecommendation, setWizardRecommendation] = useState<{
    recommendedWizard: 'DME' | 'SUPPLY';
    dmeCodes: string[];
  } | null>(null);
  useEffect(() => {
    const codes = hcpcItems.map((i) => i.code?.trim().toUpperCase()).filter(Boolean) as string[];
    if (codes.length === 0) { setWizardRecommendation(null); return; }
    // Debounce — the user is typing.
    const t = setTimeout(async () => {
      try {
        const { post } = await import('../../../api/client');
        const r = await post<any>('/hcpc-codes/categorize', { codes });
        const dmeItems = (r.items ?? []).filter((i: any) =>
          i.category === 'DME' || i.category === 'ORTHOTIC' || i.category === 'PROSTHETIC',
        );
        setWizardRecommendation({
          recommendedWizard: r.recommendedWizard,
          dmeCodes: dmeItems.map((i: any) => i.code),
        });
      } catch { /* silent */ }
    }, 500);
    return () => clearTimeout(t);
  }, [hcpcItems]);

  const [icd10Options, setIcd10Options] = useState<any[]>([]);
  const [icd10Loading, setIcd10Loading] = useState(false);
  const icd10Timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Routing preview (populated when entering the Review step)
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  // Phase B: per-item vendor override map (itemKey → vendorId).
  // Keys not present mean "use the engine's recommended vendor".
  const [itemVendorOverrides, setItemVendorOverrides] = useState<Record<string, string>>(
    draft?.itemVendorOverrides ?? {},
  );
  // Phase B: "Use one vendor for all" sticky toolbar pin (vendorId | null).
  const [pinAllToVendor, setPinAllToVendor] = useState<string | null>(
    draft?.pinAllToVendor ?? null,
  );
  // Inline coverage preview for Step 2 (when user picks vendor + facility)
  const [coveragePreview, setCoveragePreview] = useState<any | null>(null);
  const [coveragePreviewLoading, setCoveragePreviewLoading] = useState(false);
  const watchedVendorIdStep2 = Form.useWatch('vendorId', orderForm);
  const watchedFacilityIdStep2 = Form.useWatch('facilityId', orderForm);
  // Snapshot form values when moving between steps so they survive unmounting
  const [savedPatient, setSavedPatient] = useState<Record<string, any>>(draft?.savedPatient ?? {});
  const [savedOrder, setSavedOrder] = useState<Record<string, any>>(draft?.savedOrder ?? {});

  // Phase B: Customer PO picker — load OPEN POs for the hospital
  const [customerPOs, setCustomerPOs] = useState<CustomerPurchaseOrder[]>([]);
  useEffect(() => {
    customerPurchaseOrdersApi.list({ status: 'OPEN', limit: 100 })
      .then((resp) => setCustomerPOs(resp.items ?? []))
      .catch(() => { /* silent — picker just won't show options */ });
  }, []);

  const baseReviewColumns = [
    { title: 'HCPC Code', dataIndex: 'code', key: 'code' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'center' as const,
      width: 100,
    },
  ];
  const { columns: reviewColumns, components: reviewTableComponents } = useResizableColumns(baseReviewColumns as any[]);

  // Persist draft to sessionStorage whenever form state changes
  useEffect(() => {
    // Serialize savedPatient — convert dayjs birthDate to ISO string for storage
    const patientForStorage = { ...savedPatient };
    if (patientForStorage.birthDate && typeof patientForStorage.birthDate === 'object' && patientForStorage.birthDate.toISOString) {
      patientForStorage.birthDate = patientForStorage.birthDate.toISOString();
    }
    saveDraft({
      currentStep,
      savedPatient: patientForStorage,
      savedOrder,
      hcpcItems,
      selectedFacilityId,
      itemVendorOverrides,
      pinAllToVendor,
    });
  }, [
    currentStep,
    savedPatient,
    savedOrder,
    hcpcItems,
    selectedFacilityId,
    itemVendorOverrides,
    pinAllToVendor,
  ]);

  useEffect(() => {
    const fetchHospitals = async () => {
      setHospitalsLoading(true);
      try {
        const data = await get<any>('/hospitals');
        setHospitals(Array.isArray(data) ? data : (data?.items ?? []));
      } catch {
        message.error('Failed to load hospitals.');
      } finally {
        setHospitalsLoading(false);
      }
    };

    const fetchVendors = async () => {
      try {
        const data = await get<any>('/vendors');
        setVendors(Array.isArray(data) ? data : (data?.items ?? []));
      } catch {
        // vendors optional, silently fail
      }
    };

    const fetchFacilities = async () => {
      try {
        const data = await get<any>('/hospital-facilities');
        setFacilities(Array.isArray(data) ? data : (data?.items ?? []));
      } catch { /* non-critical */ }
    };

    const fetchDepartments = async () => {
      try {
        const data = await get<any>('/hospital-departments');
        setDepartments(Array.isArray(data) ? data : (data?.items ?? []));
      } catch { /* non-critical */ }
    };

    const fetchPhysicians = async () => {
      try {
        const data = await get<any>('/users?role=PHYSICIAN');
        const items = data?.users ?? data?.items ?? (Array.isArray(data) ? data : []);
        setPhysicians(items);
      } catch { /* non-critical */ }
    };

    fetchHospitals();
    fetchVendors();
    fetchFacilities();
    fetchDepartments();
    fetchPhysicians();
  }, []);

  // Auto-fill hospital for HOSPITAL users (runs once hospitals are loaded)
  useEffect(() => {
    if (userData?.userType === 'HOSPITAL' && userData?.hospitalId) {
      setSavedOrder((prev) => ({ hospitalId: userData.hospitalId, ...prev }));
    }
    // Auto-fill physician for PHYSICIAN role users
    if ((userData as any)?.role === 'PHYSICIAN' && userData?.id) {
      setSavedOrder((prev) => ({ ...prev, physicianId: userData.id }));
    }
  }, [userData?.hospitalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Epic FHIR pre-fill (Phase 1.F) ──────────────────────────────────────
  // Fires once on mount when the wizard was opened with ?fhirContext=1 (set
  // by FhirLaunchBounce after a successful Epic OAuth round trip).
  // Pulls patient + active encounter + coverage + conditions and seeds the
  // patient + order forms. Existing draft sessionStorage is overwritten — Epic
  // is the source of truth in this code path.
  useEffect(() => {
    const wantsFhir = searchParams.get('fhirContext') === '1';
    if (!wantsFhir || !fhirCtx.isFromEpic || !fhirCtx.patientId) return;
    let cancelled = false;
    setEpicPrefill({ status: 'loading' });
    (async () => {
      try {
        const data = await fhirApi.launchContextPrefill(
          fhirCtx.connId,
          fhirCtx.patientId!,
          fhirCtx.encounterId,
          fhirCtx.fhirUser,
        );
        if (cancelled) return;
        // Map Epic shapes onto the patient form's field names.
        const p = data.patient;
        if (p) {
          patientForm.setFieldsValue({
            firstName: p.given.join(' '),
            lastName: p.family,
            gender:
              p.gender === 'male' ? 'Male'
                : p.gender === 'female' ? 'Female'
                : p.gender ? 'Other' : undefined,
            birthDate: p.dob ? dayjs(p.dob) : undefined,
            email: p.email,
            phone: p.phone,
            address: p.address
              ? [
                  ...(p.address.line ?? []),
                  p.address.city,
                  p.address.state,
                  p.address.postalCode,
                ].filter(Boolean).join(', ')
              : undefined,
          });
        }
        // Pre-fill diagnosis from first active ICD-10 condition.
        const firstIcd = data.conditions.find((c) => c.icd10);
        if (firstIcd) {
          patientForm.setFieldsValue({
            icd10Code: firstIcd.icd10,
            diagnosis: firstIcd.displayText,
          });
        }
        // Pre-fill insurance from primary coverage.
        const primary = data.coverages[0];
        if (primary) {
          orderForm.setFieldsValue({
            insurance: primary.payorName,
            insuranceId: primary.memberId,
          });
        }
        setEpicPrefill({ status: 'loaded', data });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setEpicPrefill({ status: 'error', error: msg });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fhirCtx.isFromEpic, fhirCtx.patientId]);

  // Restore form values when navigating back to a step (or on first load after refresh)
  useEffect(() => {
    if (currentStep === 0 && Object.keys(savedPatient).length > 0) {
      // Rehydrate birthDate string back to dayjs after sessionStorage restore
      const vals = { ...savedPatient };
      if (vals.birthDate && typeof vals.birthDate === 'string') {
        vals.birthDate = dayjs(vals.birthDate);
      }
      patientForm.setFieldsValue(vals);
    }
    if (currentStep === 1) {
      const vals = { ...savedOrder };
      if (userData?.userType === 'HOSPITAL' && userData?.hospitalId) {
        vals.hospitalId = userData.hospitalId;
      }
      if (Object.keys(vals).length > 0) orderForm.setFieldsValue(vals);
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inline coverage preview for Step 2 (Order Details).
  // Fires whenever both vendor + facility are picked.
  useEffect(() => {
    if (currentStep !== 1) {
      // Don't bother fetching when off this step — clear stale preview.
      return;
    }
    if (!watchedVendorIdStep2 || !watchedFacilityIdStep2) {
      setCoveragePreview(null);
      return;
    }
    let cancelled = false;
    setCoveragePreviewLoading(true);
    setCoveragePreview(null);
    (async () => {
      try {
        const data = await get<any>('/vendor-coverage', {
          facilityId: watchedFacilityIdStep2,
          vendorId: watchedVendorIdStep2,
        });
        if (cancelled) return;
        const entry = Array.isArray(data) ? data[0] : null;
        setCoveragePreview(entry || null);
      } catch {
        if (!cancelled) setCoveragePreview(null);
      } finally {
        if (!cancelled) setCoveragePreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, watchedVendorIdStep2, watchedFacilityIdStep2]);

  // Fetch routing suggestions when entering the Review step
  useEffect(() => {
    if (currentStep !== 2) return;
    const hospitalId = savedOrder.hospitalId || (userData?.userType === 'HOSPITAL' ? userData?.hospitalId : undefined);
    const facilityId = savedOrder.facilityId;
    // If user has manually picked a single vendor, skip routing — respect their choice
    if (savedOrder.vendorId) {
      setRouting(null);
      setRoutingError(null);
      return;
    }
    if (!hospitalId || !facilityId) {
      setRouting(null);
      setRoutingError(
        !facilityId
          ? 'Pick a facility in Order Details to get vendor routing suggestions.'
          : 'Pick a hospital to get vendor routing suggestions.',
      );
      return;
    }
    const items = hcpcItems
      .filter((i) => i.code)
      .map((i) => ({
        itemKey: i.key,
        hcpcCode: i.code,
        quantity: i.quantity ?? 1,
        priority: savedOrder.priority || 'routine',
      }));
    if (items.length === 0) {
      setRouting(null);
      return;
    }
    setRoutingLoading(true);
    setRoutingError(null);
    post<any>('/routing/suggestions', { hospitalId, facilityId, items })
      .then((data) => {
        setRouting(data as RoutingResponse);
      })
      .catch((err: any) => {
        setRoutingError(err?.response?.data?.message || 'Failed to fetch routing suggestions.');
        setRouting(null);
      })
      .finally(() => setRoutingLoading(false));
  }, [currentStep, savedOrder.hospitalId, savedOrder.facilityId, savedOrder.vendorId, savedOrder.priority, hcpcItems, userData]);

  const addHcpcItem = () => {
    setHcpcItems([
      ...hcpcItems,
      { key: String(Date.now()), code: '', description: '', quantity: 1 },
    ]);
  };

  const removeHcpcItem = (key: string) => {
    if (hcpcItems.length > 1) {
      setHcpcItems(hcpcItems.filter((item) => item.key !== key));
    }
  };

  const updateHcpcItem = (key: string, field: keyof HcpcItem, value: string | number) => {
    setHcpcItems(
      hcpcItems.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  };

  const searchHcpc = useCallback((itemKey: string, searchText: string) => {
    if (hcpcTimers.current[itemKey]) clearTimeout(hcpcTimers.current[itemKey]);
    if (!searchText || searchText.length < 2) {
      setHcpcOptions((prev) => ({ ...prev, [itemKey]: [] }));
      return;
    }
    setHcpcLoading((prev) => ({ ...prev, [itemKey]: true }));
    hcpcTimers.current[itemKey] = setTimeout(async () => {
      try {
        const vendorId = savedOrder.vendorId || orderForm.getFieldValue('vendorId') || '';
        const params = new URLSearchParams({ search: searchText, limit: '20' });
        if (vendorId) params.set('vendorId', vendorId);
        const data = await get<any>(`/hcpc-codes?${params.toString()}`);
        setHcpcOptions((prev) => ({ ...prev, [itemKey]: data?.items ?? [] }));
      } catch {
        setHcpcOptions((prev) => ({ ...prev, [itemKey]: [] }));
      } finally {
        setHcpcLoading((prev) => ({ ...prev, [itemKey]: false }));
      }
    }, 300);
  }, [savedOrder.vendorId, orderForm]);

  // Infer extremity from ICD-10 description
  const inferExtremityFromIcd10 = useCallback((description: string): string | null => {
    const desc = description.toLowerCase();
    const isRight = desc.includes('right');
    const isLeft = desc.includes('left');
    const isBilateral = desc.includes('bilateral');

    const isUpper = /shoulder|upper arm|elbow|forearm|wrist|hand|finger|thumb|carpal|humero|humeral|radius|radial|ulna|ulnar|clavicle/.test(desc);
    const isLower = /hip|thigh|femur|femoral|knee|tibia|tibial|fibula|fibular|lower leg|ankle|foot|toe|metatars|calcaneal|plantar|patella|patellar|hallux/.test(desc);

    if (isBilateral) return 'Bilateral';
    if (isRight && isUpper) return 'Right Upper';
    if (isLeft && isUpper) return 'Left Upper';
    if (isRight && isLower) return 'Right Lower';
    if (isLeft && isLower) return 'Left Lower';
    return null; // non-extremity (spine, systemic, respiratory, etc.)
  }, []);

  const searchIcd10 = useCallback((searchText: string) => {
    if (icd10Timer.current) clearTimeout(icd10Timer.current);
    if (!searchText || searchText.length < 2) {
      setIcd10Options([]);
      return;
    }
    setIcd10Loading(true);
    icd10Timer.current = setTimeout(async () => {
      try {
        const data = await get<any>(`/icd10-codes?search=${encodeURIComponent(searchText)}&limit=20`);
        setIcd10Options(data?.items ?? []);
      } catch {
        setIcd10Options([]);
      } finally {
        setIcd10Loading(false);
      }
    }, 300);
  }, []);

  const handleNext = async () => {
    try {
      if (currentStep === 0) {
        await patientForm.validateFields();
        setSavedPatient(patientForm.getFieldsValue());
      } else if (currentStep === 1) {
        await orderForm.validateFields();
        const hasEmptyItems = hcpcItems.some((item) => !item.code || !item.description);
        if (hasEmptyItems) {
          message.error('Please fill in all HCPC code fields.');
          return;
        }
        setSavedOrder(orderForm.getFieldsValue());
      }
      setCurrentStep((s) => s + 1);
    } catch {
      message.error('Please fill in all required fields.');
    }
  };

  const handleSubmit = async () => {
    // Hard-stop: routing ran but produced unroutable items (no manual override).
    if (!savedOrder.vendorId && routing && routing.unroutable.length > 0) {
      message.error(
        `Cannot submit — ${routing.unroutable.length} item(s) have no eligible vendor. Please escalate to admin or select a vendor manually.`,
      );
      return;
    }

    // Soft guard: no manual vendor AND routing produced nothing (no facility
    // selected, or no preferred vendors at all) — confirm before submitting
    // as an unassigned order.
    if (!savedOrder.vendorId && (!routing || Object.keys(routing.groupedByVendor).length === 0)) {
      const confirmed = window.confirm(
        'No vendor was assigned to this order. It will be created as PENDING with no vendor. Continue?',
      );
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const patientValues = savedPatient;
      const orderValues = savedOrder;

      const basePayload: any = {
        patientName: patientValues.firstName,
        patientLastName: patientValues.lastName,
        patientGender: patientValues.gender,
        patientBirthDate: patientValues.birthDate
          ? dayjs(patientValues.birthDate).format('YYYY-MM-DD')
          : undefined,
        patientEmail: patientValues.email,
        patientPhone: patientValues.phone,
        patientAddress: patientValues.address,
        icd10: patientValues.icd10Code,
        diagnosis: patientValues.diagnosis,
        extremity: patientValues.extremity,
        hospitalId: orderValues.hospitalId,
        priority: orderValues.priority,
        insurance: orderValues.insurance,
        insuranceId: orderValues.insuranceId,
        facilityId: orderValues.facilityId,
        departmentId: orderValues.departmentId,
        physicianId: orderValues.physicianId,
        comment: orderValues.comment,
        // Phase B: procurement extras
        customerPurchaseOrderId: orderValues.customerPurchaseOrderId ?? null,
        taxExempt: orderValues.taxExempt === true ? 1 : orderValues.taxExempt === false ? 0 : undefined,
        orderer: orderValues.orderer,
        shipToContact: orderValues.shipToContact,
        billToContact: orderValues.billToContact,
        clinicalContact: orderValues.clinicalContact,
      };

      // Phase B: rebuild vendorGroups from per-item overrides + pin.
      // Resolution priority for each item:
      //   1. pinAllToVendor (if set, all items go to this vendor)
      //   2. itemVendorOverrides[itemKey] (per-item picker selection)
      //   3. routing.suggestion.recommended.vendorId (engine's default)
      const resolveVendorForItem = (itemKey: string): string | null => {
        if (pinAllToVendor) return pinAllToVendor;
        if (itemVendorOverrides[itemKey]) return itemVendorOverrides[itemKey];
        const sug = routing?.suggestions.find((s) => s.itemKey === itemKey);
        return sug?.recommended?.vendorId ?? null;
      };

      const rebuiltGroups: Record<string, string[]> = {};
      if (routing) {
        for (const sug of routing.suggestions) {
          const vid = resolveVendorForItem(sug.itemKey);
          if (vid) (rebuiltGroups[vid] ||= []).push(sug.itemKey);
        }
      }
      const vendorGroups = Object.entries(rebuiltGroups).map(
        ([vendorId, itemKeys]) => ({ vendorId, itemKeys }),
      );

      // Split-order path: more than one vendor in the rebuilt groups AND user
      // hasn't manually overridden with a single vendorId.
      const shouldSplit =
        !orderValues.vendorId && vendorGroups.length > 1;

      if (shouldSplit && routing) {
        const splits = vendorGroups.map((group) => ({
          vendorId: group.vendorId,
          orderItems: group.itemKeys
            .map((k) => hcpcItems.find((h) => h.key === k))
            .filter((h): h is HcpcItem => !!h)
            .map(({ code, description, quantity }) => ({ code, description, quantity })),
        }));
        await post('/orders', { ...basePayload, splits });
        clearDraft();
        message.success(`Split order created across ${splits.length} vendors.`);
        navigate('/provider-orders');
        return;
      }

      // Single-vendor path: use manual override if set, else use the single
      // vendor from routing suggestions (if all items map to the same vendor).
      const singleVendorId =
        orderValues.vendorId ||
        (vendorGroups.length === 1 ? vendorGroups[0].vendorId : undefined);

      await post('/orders', {
        ...basePayload,
        vendorId: singleVendorId,
        orderItems: hcpcItems.map(({ code, description, quantity }) => ({
          code,
          description,
          quantity,
        })),
      });

      clearDraft();
      message.success('Supply order created successfully!');
      navigate('/provider-orders');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderPatientInfo = () => (
    <>
      {epicPrefill.status !== 'idle' && (
        <Alert
          type={
            epicPrefill.status === 'loaded' ? 'success'
              : epicPrefill.status === 'error' ? 'error'
              : 'info'
          }
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <Space>
              <FromEpicBadge inline />
              {epicPrefill.status === 'loading' && <Text>Pulling patient context from Epic…</Text>}
              {epicPrefill.status === 'loaded' && epicPrefill.data?.patient && (
                <Text>
                  Pre-filled from Epic: <Text strong>{epicPrefill.data.patient.name}</Text>
                  {epicPrefill.data.coverages[0] && (
                    <> · coverage: <Text>{epicPrefill.data.coverages[0].payorName}</Text></>
                  )}
                  {epicPrefill.data.conditions.find((c) => c.icd10) && (
                    <> · dx: <Text>{epicPrefill.data.conditions.find((c) => c.icd10)?.icd10}</Text></>
                  )}
                </Text>
              )}
              {epicPrefill.status === 'error' && (
                <Text type="danger">Epic pre-fill failed: {epicPrefill.error}</Text>
              )}
            </Space>
          }
        />
      )}
    <FormCard title="Patient Information">
      <Form form={patientForm} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'First name is required' }]}>
              <Input placeholder="Enter first name" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Last name is required' }]}>
              <Input placeholder="Enter last name" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="gender" label="Gender" rules={[{ required: true, message: 'Gender is required' }]}>
              <Select placeholder="Select gender">
                <Option value="Male">Male</Option>
                <Option value="Female">Female</Option>
                <Option value="Other">Other</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="birthDate" label="Date of Birth" rules={[{ required: true, message: 'Birth date is required' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d && d.isAfter(dayjs())} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ type: 'email', message: 'Enter a valid email' }]}
            >
              <Input placeholder="patient@email.com" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="phone" label="Phone">
              <Input placeholder="e.g., (555) 123-4567" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="address" label="Address">
              <Input placeholder="Street address, city, state, ZIP" />
            </Form.Item>
          </Col>
          <Col xs={24} md={18}>
            <Form.Item
              name="icd10Code"
              label="ICD-10 Diagnosis"
              rules={[{ required: true, message: 'ICD-10 code is required' }]}
            >
              <Select
                showSearch
                placeholder="Search ICD-10 (e.g., M17.11 or knee)"
                loading={icd10Loading}
                filterOption={false}
                onSearch={searchIcd10}
                allowClear
                onChange={(val: string) => {
                  if (!val) {
                    patientForm.setFieldValue('diagnosis', undefined);
                    return;
                  }
                  const match = icd10Options.find((r: any) => r.code === val);
                  if (match) {
                    patientForm.setFieldValue('diagnosis', match.description);
                    const inferred = inferExtremityFromIcd10(match.description);
                    if (inferred) patientForm.setFieldValue('extremity', inferred);
                  }
                }}
                notFoundContent={icd10Loading ? <Spin size="small" /> : 'Type 2+ characters to search'}
              >
                {icd10Options.map((r: any) => (
                  <Option key={r.code} value={r.code}>
                    <strong>{r.code}</strong> — {r.description}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="extremity"
              label="Extremity"
              extra={<span style={{ fontSize: 11, color: '#8c8c8c' }}>Auto-filled from ICD-10 when applicable</span>}
            >
              <Select placeholder="Select extremity" allowClear>
                <Option value="Left Upper">Left Upper</Option>
                <Option value="Right Upper">Right Upper</Option>
                <Option value="Left Lower">Left Lower</Option>
                <Option value="Right Lower">Right Lower</Option>
                <Option value="Bilateral">Bilateral</Option>
                <Option value="N/A">N/A</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item
              name="diagnosis"
              label="Diagnosis"
              extra={<span style={{ fontSize: 11, color: '#8c8c8c' }}>Auto-filled from the selected ICD-10 code — edit if needed</span>}
            >
              <Input placeholder="Diagnosis description" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </FormCard>
    </>
  );

  const renderOrderDetails = () => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <FormCard title="Order Details">
        {hospitalsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <Form form={orderForm} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="hospitalId" label="Hospital" rules={[{ required: true, message: 'Hospital is required' }]}>
                  <Select placeholder="Select hospital" showSearch optionFilterProp="children">
                    {hospitals.map((h) => (
                      <Option key={h.id} value={h.id}>{h.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="vendorId"
                  label="Vendor (optional)"
                  extra={(() => {
                    if (!watchedVendorIdStep2 || !watchedFacilityIdStep2) {
                      return (
                        <span style={{ fontSize: 12, color: '#999' }}>
                          Pick a facility to see vendor coverage. Leave blank to let the system auto-route.
                        </span>
                      );
                    }
                    if (coveragePreviewLoading) {
                      return <span style={{ fontSize: 12, color: '#999' }}>Checking coverage…</span>;
                    }
                    if (!coveragePreview) return null;
                    const summary = coveragePreview.summary || {};
                    const facility = facilities.find((f) => f.id === watchedFacilityIdStep2);
                    const stateLabel = facility?.state || 'this facility';
                    if (summary.branchesServing > 0) {
                      const caps = (summary.capabilityUnion || []).slice(0, 3).join(', ');
                      const sla = summary.bestSlaHours;
                      return (
                        <Tag color="success" style={{ marginTop: 6 }}>
                          ✓ Covers {stateLabel}
                          {caps ? ` · ${caps}` : ''}
                          {typeof sla === 'number' ? ` · ${sla}h` : ''}
                        </Tag>
                      );
                    }
                    const vendorName =
                      vendors.find((v) => v.id === watchedVendorIdStep2)?.name || 'this vendor';
                    return (
                      <Tag color="warning" style={{ marginTop: 6 }}>
                        ⚠ No location of {vendorName} serves {stateLabel} — order may fail to route
                      </Tag>
                    );
                  })()}
                >
                  <Select placeholder="Select vendor" allowClear showSearch optionFilterProp="children">
                    {vendors.map((v) => (
                      <Option key={v.id} value={v.id}>{v.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="priority" label="Priority" rules={[{ required: true, message: 'Priority is required' }]}>
                  <Select placeholder="Select priority">
                    <Option value="routine">Routine</Option>
                    <Option value="urgent">Urgent</Option>
                    <Option value="emergent">Emergent</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="insurance" label="Insurance Provider">
                  <Input placeholder="Insurance provider name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="insuranceId" label="Insurance ID">
                  <Input placeholder="Insurance ID number" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="physicianId" label="Ordering Physician">
                  <Select
                    placeholder="Select physician"
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    disabled={(userData as any)?.role === 'PHYSICIAN'}
                  >
                    {physicians.map((p) => (
                      <Option key={p.id} value={p.id}>
                        {p.name}{p.npiNumber ? ` (NPI: ${p.npiNumber})` : ''}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="facilityId" label="Facility">
                  <Select
                    placeholder="Select facility"
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    onChange={(val) => {
                      setSelectedFacilityId(val ?? null);
                      orderForm.setFieldValue('departmentId', undefined);
                    }}
                  >
                    {facilities.map((f) => (
                      <Option key={f.id} value={f.id}>
                        {f.name}{f.number ? ` (${f.number})` : ''}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="departmentId" label="Department">
                  <Select
                    placeholder="Select department"
                    allowClear
                    showSearch
                    optionFilterProp="children"
                  >
                    {departments
                      .filter((d) => !selectedFacilityId || !d.facilityId || d.facilityId === selectedFacilityId)
                      .map((d) => (
                        <Option key={d.id} value={d.id}>
                          {d.name}{d.number ? ` (${d.number})` : ''}
                        </Option>
                      ))}
                  </Select>
                </Form.Item>
              </Col>
              {/* Phase B: Customer PO picker */}
              <Col xs={24} md={12}>
                <Form.Item name="customerPurchaseOrderId" label="Customer PO" tooltip="Buyer-side PO that will be debited for this order.">
                  <Select
                    placeholder={customerPOs.length === 0 ? 'No open POs' : 'Select PO (optional)'}
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    options={customerPOs.map((po) => ({
                      value: po.id,
                      label: `${po.poNumber} — remaining $${
                        po.authorizedAmount != null
                          ? (po.authorizedAmount - (po.spentAmount ?? 0)).toFixed(2)
                          : '(no cap)'
                      }`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="taxExempt" label="Tax exemption" tooltip="Mark if this order is tax-exempt (overrides hospital default).">
                  <Select placeholder="Hospital default" allowClear
                    options={[{ value: true, label: 'Tax-exempt' }, { value: false, label: 'Taxable' }]} />
                </Form.Item>
              </Col>

              {/* Phase B: Orderer + contacts */}
              <Col xs={24}>
                <Card size="small" title="Procurement contacts (optional)" style={{ background: '#fafafa', marginBottom: 16 }} bodyStyle={{ paddingTop: 12 }}>
                  <Row gutter={12}>
                    <Col xs={24}><Text type="secondary" style={{ fontSize: 12 }}>Orderer — the person placing this order</Text></Col>
                    <Col xs={24} md={8}><Form.Item name={['orderer', 'name']} label="Name"><Input placeholder="e.g. Jane Procurement" /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name={['orderer', 'email']} label="Email"><Input placeholder="jane@hospital.org" /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name={['orderer', 'phone']} label="Phone"><Input /></Form.Item></Col>

                    <Col xs={24}><Text type="secondary" style={{ fontSize: 12 }}>Ship-To contact — who to call about delivery</Text></Col>
                    <Col xs={24} md={8}><Form.Item name={['shipToContact', 'name']} label="Name"><Input /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name={['shipToContact', 'email']} label="Email"><Input /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name={['shipToContact', 'phone']} label="Phone"><Input /></Form.Item></Col>

                    <Col xs={24}><Text type="secondary" style={{ fontSize: 12 }}>Clinical contact — for medical questions about this order</Text></Col>
                    <Col xs={24} md={8}><Form.Item name={['clinicalContact', 'name']} label="Name"><Input /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name={['clinicalContact', 'email']} label="Email"><Input /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name={['clinicalContact', 'phone']} label="Phone"><Input /></Form.Item></Col>
                  </Row>
                </Card>
              </Col>

              <Col xs={24}>
                <Form.Item name="comment" label="Comments">
                  <TextArea rows={3} placeholder="Additional notes or comments..." />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </FormCard>

      <FormCard
        title="HCPC Codes"
        extra={
          <Button type="dashed" icon={<PlusOutlined />} onClick={addHcpcItem}>
            Add HCPC Code
          </Button>
        }
      >
        {/* Wizard-routing banner: warn when the line items need DME flow. */}
        {wizardRecommendation?.recommendedWizard === 'DME' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="DME codes detected — consider the DME order wizard"
            description={
              <span>
                {wizardRecommendation.dmeCodes.join(', ')}{' '}
                {wizardRecommendation.dmeCodes.length === 1 ? 'is a' : 'are'} Medicare-regulated DME
                code{wizardRecommendation.dmeCodes.length === 1 ? '' : 's'}. The DME wizard collects
                the face-to-face date, length of need, DWO and other documentation Medicare requires
                for these claims.
              </span>
            }
            action={
              <Button
                size="small"
                type="primary"
                onClick={() => navigate('/create-dme-order')}
              >
                Switch to DME order
              </Button>
            }
          />
        )}
        {hcpcItems.length === 0 ? (
          <Alert message="Add at least one HCPC code." type="info" showIcon />
        ) : (
          hcpcItems.map((item, index) => (
            <Card
              key={item.key}
              size="small"
              style={{ marginBottom: 12, background: '#fafafa' }}
              bodyStyle={{ padding: '12px 16px' }}
            >
              <Row gutter={12} align="middle">
                <Col flex="none">
                  <Text type="secondary" style={{ fontSize: 12 }}>#{index + 1}</Text>
                </Col>
                <Col xs={24} sm={6}>
                  <Select
                    showSearch
                    placeholder="Search HCPC (e.g., L1832 or knee)"
                    value={item.code || undefined}
                    loading={hcpcLoading[item.key]}
                    filterOption={false}
                    onSearch={(val) => searchHcpc(item.key, val)}
                    onChange={(val) => {
                      const match = hcpcOptions[item.key]?.find((r: any) => r.code === val);
                      setHcpcItems((prev) =>
                        prev.map((it) =>
                          it.key === item.key
                            ? { ...it, code: val || '', description: match?.description ?? it.description }
                            : it
                        )
                      );
                      // Kick off a formulary lookup for the selected code
                      lookupFormulary(item.key, val || '');
                    }}
                    allowClear
                    onClear={() => {
                      updateHcpcItem(item.key, 'code', '');
                      updateHcpcItem(item.key, 'description', '');
                    }}
                    notFoundContent={
                      hcpcLoading[item.key] ? <Spin size="small" /> : 'Type 2+ chars to search'
                    }
                    style={{ width: '100%' }}
                  >
                    {(hcpcOptions[item.key] || []).map((r: any) => (
                      <Option key={r.code} value={r.code}>
                        <strong>{r.code}</strong>{' '}{r.description}
                        {r.source === 'vendor' && (
                          <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>Vendor</Tag>
                        )}
                      </Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={10}>
                  <Input
                    placeholder="Description (auto-filled on select)"
                    value={item.description}
                    onChange={(e) => updateHcpcItem(item.key, 'description', e.target.value)}
                  />
                </Col>
                <Col xs={24} sm={4}>
                  <InputNumber
                    min={1}
                    style={{ width: '100%' }}
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(val) => updateHcpcItem(item.key, 'quantity', val || 1)}
                  />
                </Col>
                <Col xs={24} sm={3} style={{ textAlign: 'right' }}>
                  {hcpcItems.length > 1 && (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeHcpcItem(item.key)}
                    />
                  )}
                </Col>
              </Row>
              {/* Formulary decision banner (Feature 7 integration) */}
              {formularyDecisions[item.key] && (
                <div style={{ marginTop: 8, paddingLeft: 24 }}>
                  {formularyDecisions[item.key]!.decision === 'ON_FORMULARY' && (
                    <Tag color="green">On formulary</Tag>
                  )}
                  {formularyDecisions[item.key]!.decision === 'OFF_FORMULARY' && (
                    <Tag color="orange">⚠ Off-formulary — requires approval</Tag>
                  )}
                  {formularyDecisions[item.key]!.decision === 'RESTRICTED' && (
                    <Tag color="red">⚠ Restricted item — needs special approval</Tag>
                  )}
                  {formularyDecisions[item.key]!.maxPrice != null && (
                    <Tag color="blue">Max ${formularyDecisions[item.key]!.maxPrice!.toFixed(2)}/unit</Tag>
                  )}
                  {formularyDecisions[item.key]!.preferredVendorId && (
                    <Tag color="purple">Preferred vendor on file</Tag>
                  )}

                  {/* Substitute chips — PV2 caveat 2.
                      Show approved substitutes whenever any exist, ranked by
                      priority. One-click swap rewrites the row + re-lookups. */}
                  {formularyDecisions[item.key]!.substitutes.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <span style={{ color: '#666', marginRight: 6 }}>Approved substitutes:</span>
                      {formularyDecisions[item.key]!.substitutes.slice(0, 5).map((sub) => (
                        <Tag
                          key={sub.substituteHcpcCode}
                          color="cyan"
                          style={{ cursor: 'pointer', marginInlineEnd: 4 }}
                          onClick={() => swapToSubstitute(item.key, sub)}
                          title={sub.substituteDescription ?? sub.substituteHcpcCode}
                        >
                          ⇄ {sub.substituteHcpcCode}
                          {sub.priority != null && (
                            <span style={{ marginLeft: 4, opacity: 0.6 }}>(p{sub.priority})</span>
                          )}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </FormCard>
    </Space>
  );

  const renderReview = () => {
    const p = savedPatient;
    const o = savedOrder;
    const hospitalName = hospitals.find((h) => h.id === o.hospitalId)?.name || o.hospitalId || '—';
    const vendorName = vendors.find((v) => v.id === o.vendorId)?.name || o.vendorId || '—';
    const facilityObj = facilities.find((f) => f.id === o.facilityId);
    const facilityLabel = facilityObj ? `${facilityObj.name}${facilityObj.number ? ` (${facilityObj.number})` : ''}` : '—';
    const deptObj = departments.find((d) => d.id === o.departmentId);
    const deptLabel = deptObj ? `${deptObj.name}${deptObj.number ? ` (${deptObj.number})` : ''}` : '—';
    const physObj = physicians.find((ph) => ph.id === o.physicianId);
    const physLabel = physObj ? `${physObj.name}${physObj.npiNumber ? ` (NPI: ${physObj.npiNumber})` : ''}` : '—';

    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <ReviewSection title="Patient Information">
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Full Name">
              {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Gender">{p.gender || '—'}</Descriptions.Item>
            <Descriptions.Item label="Date of Birth">
              {p.birthDate ? dayjs(p.birthDate).format('MM/DD/YYYY') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Email">{p.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{p.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Address" span={2}>{p.address || '—'}</Descriptions.Item>
            <Descriptions.Item label="ICD-10 Diagnosis">
              {(() => {
                if (!p.icd10Code) return '—';
                const match = icd10Options.find((r: any) => r.code === p.icd10Code);
                return match ? `${match.code} — ${match.description}` : p.icd10Code;
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="Extremity">{p.extremity || '—'}</Descriptions.Item>
          </Descriptions>
        </ReviewSection>

        <ReviewSection title="Order Details">
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Hospital">{hospitalName}</Descriptions.Item>
            <Descriptions.Item label="Vendor">{vendorName}</Descriptions.Item>
            <Descriptions.Item label="Priority">
              {o.priority ? o.priority.charAt(0).toUpperCase() + o.priority.slice(1) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Insurance">{o.insurance || '—'}</Descriptions.Item>
            <Descriptions.Item label="Insurance ID">{o.insuranceId || '—'}</Descriptions.Item>
            <Descriptions.Item label="Ordering Physician">{physLabel}</Descriptions.Item>
            <Descriptions.Item label="Facility">{facilityLabel}</Descriptions.Item>
            <Descriptions.Item label="Department">{deptLabel}</Descriptions.Item>
            {o.comment && (
              <Descriptions.Item label="Comments" span={2}>{o.comment}</Descriptions.Item>
            )}
          </Descriptions>
        </ReviewSection>

        <ReviewSection title="HCPC Codes">
          <Table
            dataSource={hcpcItems}
            rowKey="key"
            columns={reviewColumns}
            components={reviewTableComponents}
            pagination={false}
            size="small"
          />
        </ReviewSection>

        <ReviewSection title="Vendor Routing">
          {o.vendorId ? (
            <Alert
              type="info"
              showIcon
              message={`Manual vendor override: ${vendorName}`}
              description="Routing engine skipped — all items will be sent to the selected vendor."
            />
          ) : routingLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Spin tip="Checking eligible vendors…" />
            </div>
          ) : routingError ? (
            <Alert type="warning" showIcon message={routingError} />
          ) : routing ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {routing.unroutable.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  message={`${routing.unroutable.length} item(s) have no eligible vendor — escalate to admin.`}
                  description={
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {routing.suggestions
                        .filter((s) => routing.unroutable.includes(s.itemKey))
                        .map((s) => {
                          const row = hcpcItems.find((h) => h.key === s.itemKey);
                          return (
                            <li key={s.itemKey}>
                              <strong>{row?.code || s.itemKey}</strong>:{' '}
                              {s.errors.join('; ') || 'No eligible vendor'}
                            </li>
                          );
                        })}
                    </ul>
                  }
                />
              )}
              {/* Phase B: routing canvas with per-item ranked pickers */}
              {(() => {
                if (routing.suggestions.length === 0) return null;

                // Build the same effective grouping the submit handler will use.
                const resolveVendor = (itemKey: string): string | null => {
                  if (pinAllToVendor) return pinAllToVendor;
                  if (itemVendorOverrides[itemKey])
                    return itemVendorOverrides[itemKey];
                  const sug = routing.suggestions.find(
                    (s) => s.itemKey === itemKey,
                  );
                  return sug?.recommended?.vendorId ?? null;
                };
                const effectiveGroups: Record<string, string[]> = {};
                for (const sug of routing.suggestions) {
                  const vid = resolveVendor(sug.itemKey);
                  if (vid) (effectiveGroups[vid] ||= []).push(sug.itemKey);
                }
                const effectiveVendorIds = Object.keys(effectiveGroups);

                // Vendors that appear in any candidate (recommended or alternatives)
                // — used for the "Use one vendor for all" picker.
                const vendorOptionsSet = new Map<string, string>();
                for (const sug of routing.suggestions) {
                  if (sug.recommended) {
                    vendorOptionsSet.set(
                      sug.recommended.vendorId,
                      sug.recommended.vendorName ||
                        sug.recommended.vendorId,
                    );
                  }
                  for (const alt of sug.alternatives) {
                    vendorOptionsSet.set(
                      alt.vendorId,
                      alt.vendorName || alt.vendorId,
                    );
                  }
                }

                // Banner text describing the effective routing
                let bannerType: 'success' | 'warning' | 'info' = 'info';
                let bannerText = '';
                if (pinAllToVendor) {
                  const name =
                    vendorOptionsSet.get(pinAllToVendor) || pinAllToVendor;
                  bannerType = 'success';
                  bannerText = `Pinned to single vendor: ${name}.`;
                } else if (effectiveVendorIds.length === 0) {
                  bannerType = 'warning';
                  bannerText = 'No items have an eligible vendor yet.';
                } else if (effectiveVendorIds.length === 1) {
                  const name =
                    vendorOptionsSet.get(effectiveVendorIds[0]) ||
                    effectiveVendorIds[0];
                  bannerType = 'success';
                  bannerText = `Single vendor: ${name}.`;
                } else {
                  bannerType = 'warning';
                  bannerText = `Order will split across ${effectiveVendorIds.length} vendors (one linked child order per vendor).`;
                }

                return (
                  <>
                    <Alert
                      type={bannerType}
                      showIcon
                      message={bannerText}
                      style={{ marginBottom: 8 }}
                    />
                    <Card
                      size="small"
                      style={{ marginBottom: 12 }}
                      bodyStyle={{ padding: '8px 12px' }}
                    >
                      <Space wrap size={12}>
                        <Text strong style={{ fontSize: 13 }}>
                          Use one vendor for all items:
                        </Text>
                        <Select
                          allowClear
                          placeholder="(auto-route per item)"
                          size="small"
                          style={{ minWidth: 240 }}
                          value={pinAllToVendor ?? undefined}
                          onChange={(v) => {
                            setPinAllToVendor(v ?? null);
                            // Clearing pin also wipes per-item overrides so the
                            // user starts from engine defaults again.
                            if (!v) setItemVendorOverrides({});
                          }}
                          options={Array.from(vendorOptionsSet.entries()).map(
                            ([id, name]) => ({ value: id, label: name }),
                          )}
                        />
                        {(pinAllToVendor ||
                          Object.keys(itemVendorOverrides).length > 0) && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => {
                              setPinAllToVendor(null);
                              setItemVendorOverrides({});
                            }}
                          >
                            Reset to recommended
                          </Button>
                        )}
                      </Space>
                    </Card>
                    <Table
                      size="small"
                      pagination={false}
                      rowKey={(r) => r.itemKey}
                      dataSource={routing.suggestions}
                      columns={[
                        {
                          title: 'HCPC',
                          key: 'hcpcCode',
                          width: 130,
                          render: (_: unknown, r: RoutingSuggestion) => {
                            const row = hcpcItems.find(
                              (h) => h.key === r.itemKey,
                            );
                            return (
                              <Space direction="vertical" size={2}>
                                <code>{row?.code || '—'}</code>
                                <Tag color="geekblue">
                                  {r.category.replace('_', ' ')}
                                </Tag>
                                {row?.quantity != null && (
                                  <Text
                                    type="secondary"
                                    style={{ fontSize: 11 }}
                                  >
                                    qty {row.quantity}
                                  </Text>
                                )}
                              </Space>
                            );
                          },
                        },
                        {
                          title: 'Pick a vendor',
                          key: 'picker',
                          render: (_: unknown, r: RoutingSuggestion) => (
                            <RoutingPickerCell
                              itemKey={r.itemKey}
                              category={r.category}
                              recommended={r.recommended}
                              alternatives={r.alternatives}
                              errors={r.errors}
                              selectedVendorId={
                                pinAllToVendor ??
                                itemVendorOverrides[r.itemKey] ??
                                null
                              }
                              facilityState={routing.facilityState}
                              disabled={!!pinAllToVendor}
                              onSelect={(vendorId) => {
                                setItemVendorOverrides((prev) => ({
                                  ...prev,
                                  [r.itemKey]: vendorId,
                                }));
                              }}
                            />
                          ),
                        },
                      ]}
                    />
                  </>
                );
              })()}
            </Space>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Pick hospital and facility to see vendor routing suggestions."
            />
          )}
        </ReviewSection>
      </Space>
    );
  };

  const stepContent = [renderPatientInfo, renderOrderDetails, renderReview];

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => { clearDraft(); navigate('/provider-orders'); }}>
              Back
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              Create Supply Order
            </Title>
          </Space>
        </Col>
      </Row>

      <Card>
        <Steps
          current={currentStep}
          items={STEPS}
          style={{ marginBottom: 32 }}
        />

        <StepContent>{stepContent[currentStep]()}</StepContent>

        <Divider />

        <Row justify="space-between">
          <Col>
            {currentStep > 0 && (
              <Button onClick={() => setCurrentStep((s) => s - 1)}>
                Previous
              </Button>
            )}
          </Col>
          <Col>
            {currentStep < STEPS.length - 1 ? (
              <Button type="primary" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={loading}
                disabled={
                  !savedOrder.vendorId &&
                  !!routing &&
                  routing.unroutable.length > 0
                }
                onClick={handleSubmit}
              >
                {!savedOrder.vendorId && routing && routing.splitRequired && Object.keys(routing.groupedByVendor).length > 1
                  ? `Submit Split Order (${Object.keys(routing.groupedByVendor).length} vendors)`
                  : 'Submit Order'}
              </Button>
            )}
          </Col>
        </Row>
      </Card>
    </PageWrapper>
  );
};

export default CreateSupplyOrder;
