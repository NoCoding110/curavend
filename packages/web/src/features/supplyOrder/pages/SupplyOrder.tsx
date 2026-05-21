import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Input,
  Select,
  Row,
  Col,
  Badge,
  message,
  Skeleton,
  Tooltip,
  Drawer,
  Dropdown,
  Modal,
  Form,
  Spin,
  List,
  Popconfirm,
  Empty,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
  DeleteOutlined,
  BookOutlined,
  SaveOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ordersApi } from '../../../api/orders';
import { get } from '../../../api/client';
import { filterPresetsApi, FilterPreset } from '../../../api/filterPresets';
import { usePermissions } from '../../../hooks/usePermissions';
import { SortableColumnRow } from '../components/SortableColumnRow';
import type { RootState } from '../../../store/store';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
const { Option } = Select;

const BRAND_COLOR = '#1BAEE5';
const PRESET_ENTITY = 'orders';

const PageWrapper = styled.div`
  padding: 24px;
`;

const FilterBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

// ── Status config ──────────────────────────────────────────────────────────────

interface StatusConfig {
  color: string;
  label: string;
  badgeStatus: 'default' | 'processing' | 'success' | 'error' | 'warning';
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  NEW_ORDER: { color: 'gold', label: 'New Order', badgeStatus: 'warning' },
  VENDOR_ASSIGNED: { color: 'blue', label: 'Vendor Assigned', badgeStatus: 'processing' },
  VENDOR_CONFIRMED: { color: 'geekblue', label: 'Vendor Confirmed', badgeStatus: 'processing' },
  VENDOR_DECLINED: { color: 'red', label: 'Vendor Declined', badgeStatus: 'error' },
  DISPENSED: { color: 'purple', label: 'Dispensed', badgeStatus: 'processing' },
  DELIVERED: { color: 'lime', label: 'Delivered', badgeStatus: 'success' },
  SPEND_CONFIRMED: { color: 'cyan', label: 'Spend Confirmed', badgeStatus: 'success' },
  COMPLETED: { color: 'green', label: 'Completed', badgeStatus: 'success' },
  ORDER_COMPLETED: { color: 'green', label: 'Completed', badgeStatus: 'success' },
  CANCELLED: { color: 'red', label: 'Cancelled', badgeStatus: 'error' },
  FACILITY_CANCELLED: { color: 'red', label: 'Cancelled', badgeStatus: 'error' },
};

const STATUS_OPTIONS = [
  { value: 'NEW_ORDER', label: 'New Order' },
  { value: 'VENDOR_ASSIGNED', label: 'Vendor Assigned' },
  { value: 'VENDOR_CONFIRMED', label: 'Vendor Confirmed' },
  { value: 'VENDOR_DECLINED', label: 'Vendor Declined' },
  { value: 'DISPENSED', label: 'Dispensed' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'SPEND_CONFIRMED', label: 'Spend Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_CONFIG: Record<string, string> = {
  URGENT: 'volcano',
  HIGH: 'red',
  STANDARD: 'blue',
  LOW: 'default',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const getPatientFirstName = (order: any): string => {
  // API returns first name in `patientName`, nested firstName as fallback
  return order?.patientName || order?.patient?.firstName || order?.patient?.name?.split(' ')[0] || '—';
};

const getPatientLastName = (order: any): string => {
  // API returns last name in `patientLastName`, nested lastName as fallback
  return order?.patientLastName || order?.patient?.lastName || '—';
};

const getVendorName = (order: any): string => {
  if (order?.vendorName) return order.vendorName;
  if (!order?.vendor) return '—';
  if (typeof order.vendor === 'string') return order.vendor;
  return order.vendor.name || '—';
};

const getHospitalName = (order: any): string => {
  if (order?.hospitalName) return order.hospitalName;
  if (!order?.hospital) return '—';
  if (typeof order.hospital === 'string') return order.hospital;
  return order.hospital.name || '—';
};

const formatDate = (raw?: string): string => {
  if (!raw) return '—';
  return new Date(raw).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// ── Column config ──────────────────────────────────────────────────────────────

type ColumnKey =
  | 'orderId'
  | 'patientFirstName'
  | 'patientLastName'
  | 'status'
  | 'vendor'
  | 'hospital'
  | 'facility'
  | 'department'
  | 'physician'
  | 'priority'
  | 'dateCreated'
  | 'actions';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  alwaysVisible?: boolean;
  pinEnd?: boolean; // pinned to end regardless of order
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'orderId', label: 'Order ID' },
  { key: 'patientFirstName', label: 'Patient First Name' },
  { key: 'patientLastName', label: 'Patient Last Name' },
  { key: 'status', label: 'Status' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'hospital', label: 'Hospital' },
  { key: 'facility', label: 'Facility' },
  { key: 'department', label: 'Department' },
  { key: 'physician', label: 'Physician' },
  { key: 'priority', label: 'Priority' },
  { key: 'dateCreated', label: 'Date Created' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];

const VISIBLE_KEY_V1 = 'curavend_orders_columns_v1';
const VISIBLE_KEY = 'curavend_orders_columns_visible_v3';
const ORDER_KEY = 'curavend_orders_columns_order_v3';

const DEFAULT_VISIBLE: ColumnKey[] = [
  'orderId',
  'patientFirstName',
  'patientLastName',
  'status',
  'vendor',
  'priority',
  'dateCreated',
  'actions',
];

const DEFAULT_ORDER: ColumnKey[] = ALL_COLUMNS.filter((c) => !c.pinEnd).map((c) => c.key);

function loadVisible(): ColumnKey[] {
  try {
    const v2 = localStorage.getItem(VISIBLE_KEY);
    if (v2) return JSON.parse(v2);
    const v1 = localStorage.getItem(VISIBLE_KEY_V1);
    if (v1) return JSON.parse(v1);
  } catch {
    /* ignore */
  }
  return DEFAULT_VISIBLE;
}

function loadOrder(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ColumnKey[];
      // Merge in any new columns that didn't exist when the user last saved
      const known = new Set(parsed);
      const missing = DEFAULT_ORDER.filter((k) => !known.has(k));
      return [...parsed.filter((k) => DEFAULT_ORDER.includes(k)), ...missing];
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ORDER;
}

// ── Component ──────────────────────────────────────────────────────────────────

const SupplyOrder: React.FC = () => {
  const navigate = useNavigate();
  const userData = useSelector((state: RootState) => state.auth.userData);
  const userType = userData?.userType ?? '';
  const isHospital = userType === 'HOSPITAL';
  const isVendor = userType === 'VENDOR';
  const { can } = usePermissions();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ────────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [vendorFilter, setVendorFilter] = useState<string | undefined>(undefined);
  const [facilityFilter, setFacilityFilter] = useState<string | undefined>(undefined);
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [physicianFilter, setPhysicianFilter] = useState<string | undefined>(undefined);
  const [hospitalFilter, setHospitalFilter] = useState<string | undefined>(undefined);

  // Hospital list for vendor users — vendors see hospitals they have relationships with
  const [hospitalOptions, setHospitalOptions] = useState<{ id: string; name: string }[]>([]);

  // ── Sort state ─────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Vendor list is still small — keep eager load
  const [vendorOptions, setVendorOptions] = useState<{ id: string; name: string }[]>([]);

  // ── Async dropdown state ───────────────────────────────────
  const [facilityOptions, setFacilityOptions] = useState<any[]>([]);
  const [facilityLoading, setFacilityLoading] = useState(false);
  const [deptOptions, setDeptOptions] = useState<any[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [physicianOptions, setPhysicianOptions] = useState<any[]>([]);
  const [physicianLoading, setPhysicianLoading] = useState(false);

  // Cache of selected labels so Select can render the label for the currently-selected ID
  // even when it's not in the current search result set.
  const [selectedFacility, setSelectedFacility] = useState<{ id: string; name: string } | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<{ id: string; name: string; facilityId?: string } | null>(null);
  const [selectedPhysician, setSelectedPhysician] = useState<{ id: string; name: string } | null>(null);

  // Debounce timers
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const physicianTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Columns (order + visibility) ───────────────────────────
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(loadOrder);
  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(loadVisible);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(columnOrder));
    } catch {
      /* ignore */
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(VISIBLE_KEY, JSON.stringify(visibleCols));
    } catch {
      /* ignore */
    }
  }, [visibleCols]);

  // ── Preset state ───────────────────────────────────────────
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [saveForm] = Form.useForm();

  // ── Pagination ─────────────────────────────────────────────
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '25', '50'],
    showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} orders`,
  });

  // ── DnD sensors ────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ── Data fetching ──────────────────────────────────────────

  interface FetchFilters {
    search?: string;
    status?: string;
    vendorId?: string;
    hospitalId?: string;
    facilityId?: string;
    departmentId?: string;
    physicianId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  const fetchOrders = useCallback(
    async (page = 1, pageSize = 10, filters: FetchFilters = {}) => {
      setLoading(true);
      try {
        const params: Record<string, any> = { page, limit: pageSize };
        if (filters.search) params.search = filters.search;
        if (filters.status) params.orderSubStatus = filters.status;
        if (filters.vendorId) params.vendorId = filters.vendorId;
        if (filters.hospitalId) params.hospitalId = filters.hospitalId;
        if (filters.facilityId) params.facilityId = filters.facilityId;
        if (filters.departmentId) params.departmentId = filters.departmentId;
        if (filters.physicianId) params.physicianId = filters.physicianId;
        if (filters.sortBy) params.sortBy = filters.sortBy;
        if (filters.sortOrder) params.sortOrder = filters.sortOrder;

        const data = await ordersApi.list(params);
        const items: any[] = (data?.items ?? data?.data ?? data?.orders ?? []).map(
          (o: any, idx: number) => ({ ...o, key: o.id ?? o._id ?? String(idx) }),
        );
        const total: number = data?.total ?? data?.pagination?.total ?? items.length;

        setOrders(items);
        setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
      } catch (err: any) {
        message.error(err?.response?.data?.message || 'Failed to load orders.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const currentFilters = (): FetchFilters => ({
    search: searchText || undefined,
    status: statusFilter,
    vendorId: vendorFilter,
    hospitalId: hospitalFilter,
    facilityId: facilityFilter,
    departmentId: departmentFilter,
    physicianId: physicianFilter,
    sortBy,
    sortOrder,
  });

  // ── Async dropdown searches ────────────────────────────────

  const searchFacilities = (text: string) => {
    if (facilityTimer.current) clearTimeout(facilityTimer.current);
    if (!text || text.length < 2) {
      setFacilityOptions([]);
      return;
    }
    setFacilityLoading(true);
    facilityTimer.current = setTimeout(async () => {
      try {
        const data = await get<any>('/hospital-facilities', { search: text, limit: 20 });
        setFacilityOptions(data?.items ?? []);
      } catch {
        setFacilityOptions([]);
      } finally {
        setFacilityLoading(false);
      }
    }, 300);
  };

  const searchDepartments = (text: string) => {
    if (deptTimer.current) clearTimeout(deptTimer.current);
    if (!text || text.length < 2) {
      // Still allow browsing — if a facility is selected, fetch its departments empty-search
      if (facilityFilter) {
        fetchDepartmentsForFacility(facilityFilter);
      } else {
        setDeptOptions([]);
      }
      return;
    }
    setDeptLoading(true);
    deptTimer.current = setTimeout(async () => {
      try {
        const params: Record<string, any> = { search: text, limit: 20 };
        if (facilityFilter) params.facilityId = facilityFilter;
        const data = await get<any>('/hospital-departments', params);
        setDeptOptions(data?.items ?? []);
      } catch {
        setDeptOptions([]);
      } finally {
        setDeptLoading(false);
      }
    }, 300);
  };

  const searchPhysicians = (text: string) => {
    if (physicianTimer.current) clearTimeout(physicianTimer.current);
    if (!text || text.length < 2) {
      setPhysicianOptions([]);
      return;
    }
    setPhysicianLoading(true);
    physicianTimer.current = setTimeout(async () => {
      try {
        const data = await get<any>('/users', {
          role: 'PHYSICIAN',
          search: text,
          limit: 20,
        });
        const items: any[] = Array.isArray(data)
          ? data
          : (data?.users ?? data?.items ?? data?.data ?? []);
        setPhysicianOptions(items);
      } catch {
        setPhysicianOptions([]);
      } finally {
        setPhysicianLoading(false);
      }
    }, 300);
  };

  const fetchDepartmentsForFacility = async (fId: string | undefined) => {
    try {
      const params: Record<string, any> = { limit: 50 };
      if (fId) params.facilityId = fId;
      const data = await get<any>('/hospital-departments', params);
      setDeptOptions(data?.items ?? []);
    } catch {
      /* ignore */
    }
  };

  // ── Initial load ───────────────────────────────────────────

  useEffect(() => {
    // Load presets first — if a default exists, apply it before the initial fetch
    (async () => {
      if (isHospital) {
        // Vendors (small list — eager load)
        get<any>('/hospital-vendors')
          .then((data) => {
            const items: any[] = Array.isArray(data) ? data : (data?.items ?? []);
            const unique = Array.from(
              new Map(
                items.map((r) => [r.vendorId, { id: r.vendorId, name: r.vendorName }]),
              ).values(),
            ).filter((v) => v.id && v.name);
            setVendorOptions(unique);
          })
          .catch(() => {});
      }

      if (isVendor) {
        // Hospitals (small list — eager load, scoped to this vendor server-side)
        get<any>('/hospital-vendors')
          .then((data) => {
            const items: any[] = Array.isArray(data) ? data : (data?.items ?? []);
            const unique = Array.from(
              new Map(
                items.map((r) => [r.hospitalId, { id: r.hospitalId, name: r.hospitalName }]),
              ).values(),
            ).filter((h) => h.id && h.name);
            setHospitalOptions(unique);
          })
          .catch(() => {});
      }

      if (isHospital || isVendor) {

        // Presets
        try {
          const list = await filterPresetsApi.list(PRESET_ENTITY);
          setPresets(list);
          const defaultPreset = list.find((p) => p.isDefault);
          if (defaultPreset) {
            applyPreset(defaultPreset, false);
            return; // applyPreset triggers its own fetch
          }
        } catch {
          /* ignore */
        }
      }
      setDefaultApplied(true);
      fetchOrders(1, pagination.pageSize as number);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filter handlers ────────────────────────────────────────

  const handleSearch = (value: string) => {
    setSearchText(value);
    setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchOrders(1, pagination.pageSize as number, {
        ...currentFilters(),
        search: value || undefined,
      });
    }, 400);
  };

  const handleStatusChange = (value: string | undefined) => {
    setStatusFilter(value);
    setActivePresetId(null);
    fetchOrders(1, pagination.pageSize as number, { ...currentFilters(), status: value });
  };

  const handleVendorChange = (value: string | undefined) => {
    setVendorFilter(value);
    setActivePresetId(null);
    fetchOrders(1, pagination.pageSize as number, { ...currentFilters(), vendorId: value });
  };

  const handleHospitalChange = (value: string | undefined) => {
    setHospitalFilter(value);
    setActivePresetId(null);
    fetchOrders(1, pagination.pageSize as number, { ...currentFilters(), hospitalId: value });
  };

  const handleFacilityChange = (value: string | undefined) => {
    setFacilityFilter(value);
    setActivePresetId(null);

    // Cache selected label
    if (value) {
      const match = facilityOptions.find((f) => f.id === value);
      if (match) setSelectedFacility({ id: match.id, name: match.name });
    } else {
      setSelectedFacility(null);
    }

    // Cascade: if current department no longer belongs to this facility, clear it.
    let newDepartmentId = departmentFilter;
    if (departmentFilter) {
      const currentDept =
        deptOptions.find((d) => d.id === departmentFilter) ||
        (selectedDepartment?.id === departmentFilter ? selectedDepartment : null);
      const stillValid = !value || !currentDept?.facilityId || currentDept.facilityId === value;
      if (!stillValid) {
        newDepartmentId = undefined;
        setDepartmentFilter(undefined);
        setSelectedDepartment(null);
      }
    }

    // Reload department options scoped to new facility
    fetchDepartmentsForFacility(value);

    fetchOrders(1, pagination.pageSize as number, {
      ...currentFilters(),
      facilityId: value,
      departmentId: newDepartmentId,
    });
  };

  const handleDepartmentChange = (value: string | undefined) => {
    setDepartmentFilter(value);
    setActivePresetId(null);

    let newFacilityId = facilityFilter;

    if (value) {
      const match = deptOptions.find((d) => d.id === value);
      if (match) {
        setSelectedDepartment({ id: match.id, name: match.name, facilityId: match.facilityId });
        // Department → Facility auto-fill
        if (match.facilityId && match.facilityId !== facilityFilter) {
          newFacilityId = match.facilityId;
          setFacilityFilter(match.facilityId);
          // also cache the facility label if we can
          if (match.facilityName) {
            setSelectedFacility({ id: match.facilityId, name: match.facilityName });
          }
        }
      }
    } else {
      setSelectedDepartment(null);
    }

    fetchOrders(1, pagination.pageSize as number, {
      ...currentFilters(),
      departmentId: value,
      facilityId: newFacilityId,
    });
  };

  const handlePhysicianChange = (value: string | undefined) => {
    setPhysicianFilter(value);
    setActivePresetId(null);

    if (value) {
      const match = physicianOptions.find((p) => p.id === value);
      if (match) {
        const name =
          match.name ||
          `${match.firstName ?? ''} ${match.lastName ?? ''}`.trim() ||
          match.email ||
          match.id;
        setSelectedPhysician({ id: match.id, name });
      }
    } else {
      setSelectedPhysician(null);
    }

    fetchOrders(1, pagination.pageSize as number, { ...currentFilters(), physicianId: value });
  };

  // Map from AntD column key to API sortBy field name
  const SORT_KEY_MAP: Record<string, string> = {
    orderId: 'identifier',
    status: 'status',
    priority: 'priority',
    dateCreated: 'createdAt',
    vendor: 'vendorName',
    hospital: 'hospitalName',
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<any> | SorterResult<any>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    let newSortBy = sortBy;
    let newSortOrder = sortOrder;

    if (s?.columnKey && s.order) {
      newSortBy = SORT_KEY_MAP[s.columnKey as string] ?? 'createdAt';
      newSortOrder = s.order === 'ascend' ? 'asc' : 'desc';
    } else if (s?.columnKey && !s.order) {
      // Column header clicked a third time — reset to default
      newSortBy = 'createdAt';
      newSortOrder = 'desc';
    }

    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    fetchOrders(pag.current ?? 1, pag.pageSize ?? 10, {
      ...currentFilters(),
      sortBy: newSortBy,
      sortOrder: newSortOrder,
    });
  };

  const handleRefresh = () => {
    fetchOrders(pagination.current as number, pagination.pageSize as number, currentFilters());
  };

  const clearAllFilters = () => {
    setSearchText('');
    setStatusFilter(undefined);
    setVendorFilter(undefined);
    setHospitalFilter(undefined);
    setFacilityFilter(undefined);
    setDepartmentFilter(undefined);
    setPhysicianFilter(undefined);
    setSelectedFacility(null);
    setSelectedDepartment(null);
    setSelectedPhysician(null);
    setActivePresetId(null);
    setSortBy('createdAt');
    setSortOrder('desc');
    fetchOrders(1, pagination.pageSize as number, { sortBy: 'createdAt', sortOrder: 'desc' });
  };

  // ── Preset handlers ────────────────────────────────────────

  const applyPreset = (preset: FilterPreset, triggerFetch = true) => {
    const f = preset.filters || {};
    setSearchText(f.search ?? '');
    setStatusFilter(f.status ?? undefined);
    setVendorFilter(f.vendorId ?? undefined);
    setHospitalFilter(f.hospitalId ?? undefined);
    setFacilityFilter(f.facilityId ?? undefined);
    setDepartmentFilter(f.departmentId ?? undefined);
    setPhysicianFilter(f.physicianId ?? undefined);

    // Seed selected label caches from preset metadata if present
    if (f.facilityId && f.facilityName) {
      setSelectedFacility({ id: f.facilityId, name: f.facilityName });
    } else if (!f.facilityId) {
      setSelectedFacility(null);
    }
    if (f.departmentId && f.departmentName) {
      setSelectedDepartment({ id: f.departmentId, name: f.departmentName, facilityId: f.facilityId });
    } else if (!f.departmentId) {
      setSelectedDepartment(null);
    }
    if (f.physicianId && f.physicianName) {
      setSelectedPhysician({ id: f.physicianId, name: f.physicianName });
    } else if (!f.physicianId) {
      setSelectedPhysician(null);
    }

    setActivePresetId(preset.id);
    setDefaultApplied(true);

    if (triggerFetch) {
      fetchOrders(1, pagination.pageSize as number, {
        search: f.search,
        status: f.status,
        vendorId: f.vendorId,
        hospitalId: f.hospitalId,
        facilityId: f.facilityId,
        departmentId: f.departmentId,
        physicianId: f.physicianId,
      });
    } else {
      // Still need the initial fetch
      fetchOrders(1, pagination.pageSize as number, {
        search: f.search,
        status: f.status,
        vendorId: f.vendorId,
        hospitalId: f.hospitalId,
        facilityId: f.facilityId,
        departmentId: f.departmentId,
        physicianId: f.physicianId,
      });
    }
  };

  const buildPresetFiltersSnapshot = () => {
    const f = currentFilters();
    return {
      ...f,
      // include labels for denormalized display on restore
      facilityName: selectedFacility?.name,
      departmentName: selectedDepartment?.name,
      physicianName: selectedPhysician?.name,
    };
  };

  const handleSavePreset = async (values: { name: string; isDefault?: boolean }) => {
    try {
      const preset = await filterPresetsApi.create({
        entity: PRESET_ENTITY,
        name: values.name,
        filters: buildPresetFiltersSnapshot(),
        isDefault: !!values.isDefault,
      });
      // Refetch list to get authoritative defaults state
      const list = await filterPresetsApi.list(PRESET_ENTITY);
      setPresets(list);
      setActivePresetId(preset.id);
      setSaveModalOpen(false);
      saveForm.resetFields();
      message.success(`Preset "${preset.name}" saved`);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to save preset');
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await filterPresetsApi.remove(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (activePresetId === id) setActivePresetId(null);
      message.success('Preset deleted');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to delete preset');
    }
  };

  const handleToggleDefault = async (preset: FilterPreset) => {
    try {
      await filterPresetsApi.update(preset.id, { isDefault: !preset.isDefault });
      const list = await filterPresetsApi.list(PRESET_ENTITY);
      setPresets(list);
      message.success(preset.isDefault ? 'Default cleared' : 'Set as default');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to update preset');
    }
  };

  // ── Column definitions ─────────────────────────────────────

  const columnDefs: Record<ColumnKey, ColumnType<any>> = {
    orderId: {
      title: 'Order ID',
      key: 'orderId',
      width: 140,
      sorter: true,
      sortOrder: sortBy === 'identifier' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (_: unknown, record: any) => {
        const label = record.identifier || record.id || '—';
        return (
          <a
            style={{ color: BRAND_COLOR, fontWeight: 500 }}
            onClick={() =>
              navigate(`/provider-orders/${record.id ?? record._id ?? record.identifier}`)
            }
          >
            {label}
          </a>
        );
      },
    },
    patientFirstName: {
      title: 'Patient First Name',
      key: 'patientFirstName',
      render: (_: unknown, record: any) => <Text>{getPatientFirstName(record)}</Text>,
    },
    patientLastName: {
      title: 'Patient Last Name',
      key: 'patientLastName',
      render: (_: unknown, record: any) => <Text>{getPatientLastName(record)}</Text>,
    },
    status: {
      title: 'Status',
      key: 'status',
      width: 160,
      sorter: true,
      sortOrder: sortBy === 'status' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (_: unknown, record: any) => {
        const status = record.orderSubStatus || record.status || '';
        const cfg = STATUS_CONFIG[status];
        if (!cfg) return <Tag>{status || '—'}</Tag>;
        return <Badge status={cfg.badgeStatus} text={cfg.label} />;
      },
    },
    vendor: {
      title: 'Vendor',
      key: 'vendor',
      render: (_: unknown, record: any) => <Text>{getVendorName(record)}</Text>,
    },
    hospital: {
      title: 'Hospital',
      key: 'hospital',
      render: (_: unknown, record: any) => <Text>{getHospitalName(record)}</Text>,
    },
    facility: {
      title: 'Facility',
      key: 'facility',
      render: (_: unknown, record: any) => (
        <Text>{record.facilityName || record.facilityDetail?.name || '—'}</Text>
      ),
    },
    department: {
      title: 'Department',
      key: 'department',
      render: (_: unknown, record: any) => (
        <Text>{record.departmentName || record.departmentDetail?.name || '—'}</Text>
      ),
    },
    physician: {
      title: 'Physician',
      key: 'physician',
      render: (_: unknown, record: any) => (
        <Text>{record.physicianName || record.physicianDetail?.name || '—'}</Text>
      ),
    },
    priority: {
      title: 'Priority',
      key: 'priority',
      width: 110,
      sorter: true,
      sortOrder: sortBy === 'priority' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (_: unknown, record: any) => {
        const priority = record.priority?.toUpperCase?.() || record.priority;
        if (!priority) return <Text type="secondary">—</Text>;
        return (
          <Tag color={PRIORITY_CONFIG[priority] || 'default'}>
            {priority.charAt(0) + priority.slice(1).toLowerCase()}
          </Tag>
        );
      },
    },
    dateCreated: {
      title: 'Date Created',
      key: 'dateCreated',
      width: 130,
      sorter: true,
      sortOrder: sortBy === 'createdAt' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : undefined,
      render: (_: unknown, record: any) => (
        <Text type="secondary">{formatDate(record.createdAt ?? record.date)}</Text>
      ),
    },
    actions: {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: any) => (
        <Tooltip title="View details">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/provider-orders/${record.id ?? record._id ?? record.identifier}`);
            }}
          />
        </Tooltip>
      ),
    },
  };

  // Final visible, ordered columns (pinned columns appended last)
  const baseColumns: ColumnsType<any> = useMemo(() => {
    const isHidden = (k: ColumnKey) =>
      (k === 'hospital' && isHospital) ||
      (k === 'vendor' && isVendor);

    const orderedVisible = columnOrder
      .filter((k) => visibleCols.includes(k))
      .filter((k) => !isHidden(k));

    const pinned = ALL_COLUMNS.filter((c) => c.pinEnd).map((c) => c.key);

    const finalKeys = [...orderedVisible.filter((k) => !pinned.includes(k)), ...pinned.filter((k) => !isHidden(k))];

    return finalKeys.map((k) => columnDefs[k]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder, visibleCols, isHospital, isVendor, sortBy, sortOrder]);

  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  // ── Drawer drag handler ────────────────────────────────────
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const oldIdx = prev.indexOf(active.id as ColumnKey);
      const newIdx = prev.indexOf(over.id as ColumnKey);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const draggableColumnKeys = useMemo(
    () =>
      columnOrder
        .filter((k) => !ALL_COLUMNS.find((c) => c.key === k)?.pinEnd)
        .filter((k) => !(k === 'hospital' && isHospital))
        .filter((k) => !(k === 'vendor' && isVendor)),
    [columnOrder, isHospital, isVendor],
  );

  // ── Preset menu items ──────────────────────────────────────
  const presetMenuItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = [];
    if (presets.length === 0) {
      items.push({
        key: 'empty',
        label: <Text type="secondary">No saved presets</Text>,
        disabled: true,
      });
    } else {
      presets.forEach((p) => {
        items.push({
          key: p.id,
          label: (
            <Space>
              {p.isDefault && <StarFilled style={{ color: '#faad14' }} />}
              {activePresetId === p.id && <CheckOutlined style={{ color: BRAND_COLOR }} />}
              <span>{p.name}</span>
            </Space>
          ),
          onClick: () => applyPreset(p),
        });
      });
    }
    items.push({ type: 'divider' });
    items.push({
      key: 'save',
      icon: <SaveOutlined />,
      label: 'Save current as…',
      onClick: () => {
        saveForm.resetFields();
        setSaveModalOpen(true);
      },
    });
    if (presets.length > 0) {
      items.push({
        key: 'manage',
        icon: <SettingOutlined />,
        label: 'Manage presets…',
        onClick: () => setManageModalOpen(true),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, activePresetId]);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Supply Orders</Title>
          <Text type="secondary">Manage and track all supply orders</Text>
        </Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} />
            </Tooltip>
            {can('orders', 'WRITE') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ background: BRAND_COLOR, borderColor: BRAND_COLOR }}
                onClick={() => navigate('/create-order')}
              >
                Create Order
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: '20px 24px' }} style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <FilterBar>
          <Input
            placeholder="Search by patient name or order ID..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 260 }}
            allowClear
            onClear={() => handleSearch('')}
          />
          <Select
            placeholder="Filter by status"
            value={statusFilter}
            onChange={handleStatusChange}
            allowClear
            style={{ width: 170 }}
            onClear={() => handleStatusChange(undefined)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                <Badge
                  status={STATUS_CONFIG[opt.value]?.badgeStatus ?? 'default'}
                  text={opt.label}
                />
              </Option>
            ))}
          </Select>
          {vendorOptions.length > 0 && (
            <Select
              placeholder="Filter by vendor"
              value={vendorFilter}
              onChange={handleVendorChange}
              allowClear
              style={{ width: 170 }}
              onClear={() => handleVendorChange(undefined)}
              showSearch
              optionFilterProp="children"
            >
              {vendorOptions.map((v) => (
                <Option key={v.id} value={v.id}>{v.name}</Option>
              ))}
            </Select>
          )}
          {isVendor && hospitalOptions.length > 0 && (
            <Select
              placeholder="Filter by hospital"
              value={hospitalFilter}
              onChange={handleHospitalChange}
              allowClear
              style={{ width: 190 }}
              onClear={() => handleHospitalChange(undefined)}
              showSearch
              optionFilterProp="children"
            >
              {hospitalOptions.map((h) => (
                <Option key={h.id} value={h.id}>{h.name}</Option>
              ))}
            </Select>
          )}
          {isHospital && (
            <>
              <Select
                placeholder="Search facilities…"
                value={facilityFilter}
                onChange={handleFacilityChange}
                onSearch={searchFacilities}
                allowClear
                showSearch
                filterOption={false}
                loading={facilityLoading}
                style={{ width: 180 }}
                notFoundContent={
                  facilityLoading ? <Spin size="small" /> : <span>Type 2+ chars</span>
                }
              >
                {/* Prepend selected-cache option if not in current results */}
                {selectedFacility &&
                  !facilityOptions.find((f) => f.id === selectedFacility.id) && (
                    <Option key={selectedFacility.id} value={selectedFacility.id}>
                      {selectedFacility.name}
                    </Option>
                  )}
                {facilityOptions.map((f) => (
                  <Option key={f.id} value={f.id}>{f.name}</Option>
                ))}
              </Select>
              <Select
                placeholder="Search departments…"
                value={departmentFilter}
                onChange={handleDepartmentChange}
                onSearch={searchDepartments}
                onFocus={() => {
                  // Pre-populate with facility-scoped departments if facility selected
                  if (facilityFilter && deptOptions.length === 0) {
                    fetchDepartmentsForFacility(facilityFilter);
                  }
                }}
                allowClear
                showSearch
                filterOption={false}
                loading={deptLoading}
                style={{ width: 180 }}
                notFoundContent={
                  deptLoading ? (
                    <Spin size="small" />
                  ) : facilityFilter ? (
                    <span>No departments</span>
                  ) : (
                    <span>Type 2+ chars</span>
                  )
                }
              >
                {selectedDepartment &&
                  !deptOptions.find((d) => d.id === selectedDepartment.id) && (
                    <Option key={selectedDepartment.id} value={selectedDepartment.id}>
                      {selectedDepartment.name}
                    </Option>
                  )}
                {deptOptions.map((d) => (
                  <Option key={d.id} value={d.id}>{d.name}</Option>
                ))}
              </Select>
              <Select
                placeholder="Search physicians…"
                value={physicianFilter}
                onChange={handlePhysicianChange}
                onSearch={searchPhysicians}
                allowClear
                showSearch
                filterOption={false}
                loading={physicianLoading}
                style={{ width: 200 }}
                notFoundContent={
                  physicianLoading ? <Spin size="small" /> : <span>Type 2+ chars</span>
                }
              >
                {selectedPhysician &&
                  !physicianOptions.find((p) => p.id === selectedPhysician.id) && (
                    <Option key={selectedPhysician.id} value={selectedPhysician.id}>
                      {selectedPhysician.name}
                    </Option>
                  )}
                {physicianOptions.map((p) => {
                  const name =
                    p.name ||
                    `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() ||
                    p.email ||
                    p.id;
                  return (
                    <Option key={p.id} value={p.id}>{name}</Option>
                  );
                })}
              </Select>
            </>
          )}
          {isHospital && (
            <Dropdown menu={{ items: presetMenuItems }} trigger={['click']}>
              <Button icon={<BookOutlined />}>
                Presets{activePresetId && ' •'}
              </Button>
            </Dropdown>
          )}
          <Tooltip title="Choose & reorder columns">
            <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>
              Columns
            </Button>
          </Tooltip>
          <Button type="text" onClick={clearAllFilters}>
            Clear filters
          </Button>
        </FilterBar>

        {loading && orders.length === 0 ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table
            columns={columns}
            components={tableComponents}
            dataSource={orders}
            loading={loading}
            pagination={pagination}
            onChange={handleTableChange}
            size="middle"
            locale={{ emptyText: 'No orders found.' }}
            onRow={(record) => ({
              style: { cursor: 'pointer' },
              onClick: () =>
                navigate(`/provider-orders/${record.id ?? record._id ?? record.identifier}`),
            })}
          />
        )}
      </Card>

      {/* ── Columns drawer (reorder + visibility) ────────────── */}
      <Drawer
        title="Choose & reorder columns"
        placement="right"
        width={360}
        open={columnsDrawerOpen}
        onClose={() => setColumnsDrawerOpen(false)}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Drag rows to reorder. Check boxes to toggle visibility. Your preferences are saved to this browser.
        </Text>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draggableColumnKeys} strategy={verticalListSortingStrategy}>
            {draggableColumnKeys.map((key) => {
              const def = ALL_COLUMNS.find((c) => c.key === key)!;
              return (
                <SortableColumnRow
                  key={key}
                  id={key}
                  label={def.label}
                  checked={visibleCols.includes(key)}
                  onToggle={(next) =>
                    setVisibleCols((prev) =>
                      next ? [...new Set([...prev, key])] : prev.filter((k) => k !== key),
                    )
                  }
                />
              );
            })}
          </SortableContext>
        </DndContext>
        <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            onClick={() => {
              setVisibleCols(DEFAULT_VISIBLE);
              setColumnOrder(DEFAULT_ORDER);
            }}
          >
            Reset to Default
          </Button>
          <Button
            type="link"
            onClick={() =>
              setVisibleCols(
                ALL_COLUMNS
                  .filter((c) => !(c.key === 'hospital' && isHospital))
                  .filter((c) => !(c.key === 'vendor' && isVendor))
                  .map((c) => c.key),
              )
            }
          >
            Show All
          </Button>
        </div>
      </Drawer>

      {/* ── Save preset modal ────────────────────────────────── */}
      <Modal
        title="Save Filter Preset"
        open={saveModalOpen}
        onOk={() => saveForm.submit()}
        onCancel={() => setSaveModalOpen(false)}
        okText="Save"
      >
        <Form form={saveForm} layout="vertical" onFinish={handleSavePreset}>
          <Form.Item
            name="name"
            label="Preset Name"
            rules={[{ required: true, message: 'Please enter a name' }, { max: 100 }]}
          >
            <Input placeholder="e.g. My Spine Orders" />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked">
            <label>
              <input
                type="checkbox"
                onChange={(e) => saveForm.setFieldValue('isDefault', e.target.checked)}
              />{' '}
              Apply automatically when I open this page
            </label>
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Saves all current filters: search, status, vendor, facility, department, physician.
          </Text>
        </Form>
      </Modal>

      {/* ── Manage presets modal ─────────────────────────────── */}
      <Modal
        title="Manage Presets"
        open={manageModalOpen}
        onCancel={() => setManageModalOpen(false)}
        footer={<Button onClick={() => setManageModalOpen(false)}>Close</Button>}
      >
        {presets.length === 0 ? (
          <Empty description="No presets saved" />
        ) : (
          <List
            dataSource={presets}
            renderItem={(p) => (
              <List.Item
                actions={[
                  <Tooltip title={p.isDefault ? 'Clear default' : 'Set as default'} key="default">
                    <Button
                      type="text"
                      icon={p.isDefault ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                      onClick={() => handleToggleDefault(p)}
                    />
                  </Tooltip>,
                  <Button
                    key="apply"
                    type="link"
                    onClick={() => {
                      applyPreset(p);
                      setManageModalOpen(false);
                    }}
                  >
                    Apply
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title="Delete this preset?"
                    onConfirm={() => handleDeletePreset(p.id)}
                    okText="Delete"
                    cancelText="Cancel"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {p.name}
                      {p.isDefault && <Tag color="gold">Default</Tag>}
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Updated {new Date(p.updatedAt).toLocaleString()}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </PageWrapper>
  );
};

export default SupplyOrder;
