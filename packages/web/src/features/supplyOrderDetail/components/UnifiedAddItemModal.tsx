/**
 * UnifiedAddItemModal — replaces the old "Scan Lot Item" + "Add Non-Lot Item" pair.
 *
 * Flow:
 *   1. Search bar hits /inventory/search — results show HCPC, description, type tag.
 *   2. Picking a NON-LOT result → quantity prompt → submit.
 *   3. Picking a LOT result → lot picker (lot number + qty on hand) → quantity (capped) → submit.
 *   4. "Scan barcode" button opens inline camera; scanned value triggers lot-scan path.
 *   5. "Add ad-hoc HCPC" fallback at bottom (non-catalog, NON-LOT only).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  List,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  Divider,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  SearchOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { inventoryApi } from '../../../api/inventory';
import { encounterApi } from '../../../api/encounter';

const { Text } = Typography;

interface Lot {
  id: string;
  lotNumber: string;
  quantityOnHand: number;
  expirationDate: string | null;
}

interface CatalogItem {
  id: string;
  hcpcCode: string;
  description: string | null;
  itemType: 'LOT' | 'NON_LOT';
  manufacturerName: string | null;
  lotCount?: number;
  totalOnHand?: number;
  lots?: Lot[];
}

type Step =
  | { name: 'search' }
  | { name: 'lot-pick'; item: CatalogItem }
  | { name: 'qty'; item: CatalogItem; lotNumber?: string; lotQtyOnHand?: number; lotId?: string }
  | { name: 'adhoc' };

interface Props {
  open: boolean;
  orderId: string;
  vendorId?: string;
  section: 'ASSESSMENT' | 'DELIVERY';
  onClose: () => void;
  onAdded: () => void;
}

export const UnifiedAddItemModal: React.FC<Props> = ({
  open, orderId, vendorId, section, onClose, onAdded,
}) => {
  const [step, setStep] = useState<Step>({ name: 'search' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Camera / barcode scanner state (for lot scan)
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerId = 'unified-barcode-scanner';

  // Ad-hoc HCPC fallback
  const [adhocHcpc, setAdhocHcpc] = useState('');
  const [adhocDesc, setAdhocDesc] = useState('');

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset on close
      setStep({ name: 'search' });
      setQuery('');
      setResults([]);
      setQuantity(1);
      setScannerActive(false);
      setAdhocHcpc('');
      setAdhocDesc('');
      stopScanner();
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await inventoryApi.search({ q: q.trim(), ...(vendorId ? { vendorId } : {}) });
      setResults(data.items || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [vendorId]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(value), 350);
  };

  const pickItem = (item: CatalogItem) => {
    setQuantity(1);
    if (item.itemType === 'LOT') {
      setStep({ name: 'lot-pick', item });
    } else {
      setStep({ name: 'qty', item });
    }
  };

  const pickLot = (item: CatalogItem, lot: Lot) => {
    setQuantity(1);
    setStep({
      name: 'qty',
      item,
      lotNumber: lot.lotNumber,
      lotQtyOnHand: lot.quantityOnHand,
      lotId: lot.id,
    });
  };

  const handleSubmit = async () => {
    if (step.name === 'qty') {
      const { item, lotNumber } = step;
      setSubmitting(true);
      try {
        await encounterApi.addItem(orderId, section, {
          inventoryItemId: item.id,
          ...(lotNumber ? { lotNumber } : {}),
          quantity,
        });
        message.success('Item added');
        onAdded();
        onClose();
      } catch (err: any) {
        message.error(err?.response?.data?.message || err?.response?.data?.error || 'Failed to add item');
      } finally {
        setSubmitting(false);
      }
    }

    if (step.name === 'adhoc') {
      if (!adhocHcpc.trim()) { message.error('HCPC code is required'); return; }
      setSubmitting(true);
      try {
        await encounterApi.addItem(orderId, section, {
          hcpcCode: adhocHcpc.trim().toUpperCase(),
          description: adhocDesc || undefined,
          quantity,
        });
        message.success('Item added');
        onAdded();
        onClose();
      } catch (err: any) {
        message.error(err?.response?.data?.message || err?.response?.data?.error || 'Failed to add item');
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Lot scan via barcode camera
  const startScanner = async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    try {
      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;
      setScannerActive(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        (text: string) => {
          scanner.stop().catch(() => undefined);
          setScannerActive(false);
          handleScannedLot(text);
        },
        () => undefined,
      );
    } catch {
      message.warning('Camera unavailable — use manual entry');
    }
  };

  const stopScanner = () => {
    try { scannerRef.current?.stop(); } catch { /* empty */ }
    scannerRef.current = null;
    setScannerActive(false);
  };

  const handleScannedLot = (lotNumber: string) => {
    // Look it up in current results first (already loaded from search)
    const matchInResults = results.find((r) =>
      r.lots?.some((l) => l.lotNumber === lotNumber),
    );
    if (matchInResults) {
      const lot = matchInResults.lots!.find((l) => l.lotNumber === lotNumber)!;
      setQuantity(1);
      setStep({ name: 'qty', item: matchInResults, lotNumber: lot.lotNumber, lotQtyOnHand: lot.quantityOnHand });
      return;
    }
    // Fallback: submit directly via legacy lot-scan path (API will resolve)
    setSubmitting(true);
    encounterApi.addItem(orderId, section, { lotNumber, quantity: 1 })
      .then(() => { message.success(`Lot ${lotNumber} added`); onAdded(); onClose(); })
      .catch((err: any) => message.error(err?.response?.data?.message || 'Lot not found'))
      .finally(() => setSubmitting(false));
  };

  // --- Render ---------------------------------------------------------------

  const renderSearch = () => (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Input
        prefix={<SearchOutlined />}
        placeholder="Search by HCPC, description, item #, or lot number…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        allowClear
        autoFocus
        size="large"
      />

      {/* Barcode scanner row */}
      <Space>
        <Button
          icon={<ScanOutlined />}
          onClick={scannerActive ? stopScanner : startScanner}
          type={scannerActive ? 'primary' : 'default'}
        >
          {scannerActive ? 'Stop Camera' : 'Scan Barcode'}
        </Button>
        {scannerActive && <Text type="secondary">Point camera at barcode / QR code</Text>}
      </Space>
      <div id={scannerId} style={{ width: '100%', minHeight: scannerActive ? 200 : 0 }} />

      {/* Search results */}
      <Spin spinning={searching}>
        {results.length > 0 ? (
          <List
            bordered
            size="small"
            dataSource={results}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => pickItem(item)}
                actions={[
                  <Button size="small" type="link" key="sel">Select</Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{item.hcpcCode}</Text>
                      {item.itemType === 'LOT'
                        ? <Tag color="purple">LOT</Tag>
                        : <Tag color="blue">NON-LOT</Tag>}
                      {item.itemType === 'LOT' && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.lotCount ?? 0} lot{item.lotCount !== 1 ? 's' : ''} · {item.totalOnHand ?? 0} on hand
                        </Text>
                      )}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      {item.description && <Text type="secondary">{item.description}</Text>}
                      {item.manufacturerName && <Text type="secondary" style={{ fontSize: 11 }}>{item.manufacturerName}</Text>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : query.trim() && !searching ? (
          <Text type="secondary">No catalog items found.</Text>
        ) : null}
      </Spin>

      <Divider style={{ margin: '8px 0' }} />
      <Button type="link" size="small" onClick={() => setStep({ name: 'adhoc' })}>
        + Add ad-hoc HCPC (item not in catalog)
      </Button>
    </Space>
  );

  const renderLotPick = (item: CatalogItem) => (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => setStep({ name: 'search' })}>
        Back
      </Button>
      <Space>
        <Text strong>{item.hcpcCode}</Text>
        <Tag color="purple">LOT</Tag>
      </Space>
      {item.description && <Text type="secondary">{item.description}</Text>}

      {(!item.lots || item.lots.length === 0) ? (
        <Alert
          type="warning"
          showIcon
          message="No lots on hand for this item. Add lots in Inventory Management first."
        />
      ) : (
        <List
          bordered
          size="small"
          dataSource={item.lots}
          renderItem={(lot) => (
            <List.Item
              style={{ cursor: lot.quantityOnHand > 0 ? 'pointer' : 'not-allowed', opacity: lot.quantityOnHand > 0 ? 1 : 0.5 }}
              onClick={() => lot.quantityOnHand > 0 && pickLot(item, lot)}
              actions={[
                <Button
                  size="small"
                  type="link"
                  disabled={lot.quantityOnHand === 0}
                  key="pick"
                >
                  Select
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{lot.lotNumber}</Text>
                    <Tag color={lot.quantityOnHand > 0 ? 'green' : 'default'}>
                      {lot.quantityOnHand} on hand
                    </Tag>
                    {lot.expirationDate && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Exp: {new Date(lot.expirationDate).toLocaleDateString()}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Space>
  );

  const renderQty = () => {
    if (step.name !== 'qty') return null;
    const { item, lotNumber, lotQtyOnHand } = step;
    const maxQty = lotQtyOnHand ?? undefined;
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="link"
          onClick={() => item.itemType === 'LOT'
            ? setStep({ name: 'lot-pick', item })
            : setStep({ name: 'search' })}
        >
          Back
        </Button>
        <Space>
          <Text strong>{item.hcpcCode}</Text>
          {item.itemType === 'LOT' ? <Tag color="purple">LOT</Tag> : <Tag color="blue">NON-LOT</Tag>}
        </Space>
        {item.description && <Text type="secondary">{item.description}</Text>}
        {lotNumber && (
          <Space>
            <Text>Lot:</Text>
            <Tag>{lotNumber}</Tag>
            {maxQty !== undefined && (
              <Text type="secondary">{maxQty} available</Text>
            )}
          </Space>
        )}
        <Space>
          <Text>Quantity:</Text>
          <InputNumber
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(v) => setQuantity(v ?? 1)}
            size="large"
            style={{ width: 100 }}
          />
        </Space>
        {maxQty !== undefined && quantity > maxQty && (
          <Alert type="error" showIcon message={`Cannot exceed ${maxQty} on hand`} />
        )}
      </Space>
    );
  };

  const renderAdhoc = () => (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => setStep({ name: 'search' })}>
        Back
      </Button>
      <Text strong>Add Ad-hoc HCPC (not in catalog)</Text>
      <Alert type="info" showIcon message="This item won't be tracked as LOT. Only non-lot-tracked items can be added this way." />
      <Input
        placeholder="HCPC Code (e.g. A6253)"
        value={adhocHcpc}
        onChange={(e) => setAdhocHcpc(e.target.value.toUpperCase())}
      />
      <Input
        placeholder="Description (optional)"
        value={adhocDesc}
        onChange={(e) => setAdhocDesc(e.target.value)}
      />
      <Space>
        <Text>Quantity:</Text>
        <InputNumber min={1} value={quantity} onChange={(v) => setQuantity(v ?? 1)} style={{ width: 100 }} />
      </Space>
    </Space>
  );

  const okDisabled = (() => {
    if (step.name === 'qty') {
      const { lotQtyOnHand } = step;
      if (lotQtyOnHand !== undefined && quantity > lotQtyOnHand) return true;
      return false;
    }
    if (step.name === 'adhoc') return !adhocHcpc.trim();
    return true; // search / lot-pick don't have an OK button action
  })();

  const showOk = step.name === 'qty' || step.name === 'adhoc';

  const title =
    step.name === 'search' ? 'Add Item' :
    step.name === 'lot-pick' ? 'Select Lot' :
    step.name === 'qty' ? 'Confirm Quantity' :
    'Add Ad-hoc HCPC';

  return (
    <Modal
      title={title}
      open={open}
      onCancel={() => { stopScanner(); onClose(); }}
      onOk={showOk ? handleSubmit : undefined}
      okText="Add to Encounter"
      okButtonProps={{ disabled: okDisabled, loading: submitting }}
      footer={showOk ? undefined : null}
      destroyOnClose
      width={560}
    >
      {step.name === 'search' && renderSearch()}
      {step.name === 'lot-pick' && renderLotPick(step.item)}
      {step.name === 'qty' && renderQty()}
      {step.name === 'adhoc' && renderAdhoc()}
    </Modal>
  );
};

export default UnifiedAddItemModal;
