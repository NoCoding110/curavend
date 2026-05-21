/**
 * Add Contract Wizard — 4-step flow:
 *  1. Parties & Dates  (tenant pre-filled, counterparty dropdown)
 *  2. Document         (optional PDF upload + optional AI extraction)
 *  3. Line Items       (HCPC search + rate + qty editor)
 *  4. Review & Submit  (preview, save as DRAFT or Submit-for-approval)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Steps,
  Form,
  Input,
  DatePicker,
  Select,
  Button,
  Space,
  Upload,
  Typography,
  Table,
  message,
  Tag,
  Spin,
  Divider,
  InputNumber,
  Tooltip,
  Modal,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  RobotOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { get, uploadFile } from '../../../api/client';
import { contractsApi, type AiContractItemSuggestion } from '../../../api/contracts';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PageWrap = styled.div`
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
`;

interface CounterpartyOption {
  value: string;
  label: string;
}

interface WizardItem {
  key: string;
  hcpcCode: string;
  description: string | null;
  negotiatedRate: number;
  quantity: number | null;
  confidence?: 'high' | 'medium' | 'low';
}

// AI extraction expects a PNG base64 of the contract page. Since the web app
// doesn't currently bundle pdfjs, users must upload an image (PNG/JPG) of the
// pricing table page if they want AI extraction. PDF uploads are still stored
// as the contract document — they just can't be auto-extracted today.

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const AddContractWizard: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isHospital, isVendor, userData } = useUserRoles();

  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();

  // Step 1 state
  const [counterpartyOptions, setCounterpartyOptions] = useState<CounterpartyOption[]>([]);
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);

  // Step 2 state
  const [contractFile, setContractFile] = useState<UploadFile | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Step 3 state
  const [items, setItems] = useState<WizardItem[]>([]);

  // Final
  const [submitting, setSubmitting] = useState(false);

  // ── Load counterparties ─────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin) return; // admins type in fields manually
    const load = async () => {
      setLoadingCounterparties(true);
      try {
        const params: Record<string, any> = { approvalStatus: 'APPROVED' };
        if (isHospital && userData?.hospitalId) params.hospitalId = userData.hospitalId;
        if (isVendor && userData?.vendorId) params.vendorId = userData.vendorId;
        const resp: any = await get('/hospital-vendors', params);
        const rows: any[] = resp.items ?? resp ?? [];
        const opts = rows.map((r: any) => ({
          value: isHospital ? r.vendorId : r.hospitalId,
          label: isHospital
            ? r.vendor?.name ?? r.vendorName ?? r.vendorId
            : r.hospital?.name ?? r.hospitalName ?? r.hospitalId,
        }));
        // dedupe by value
        const seen = new Set<string>();
        const unique = opts.filter((o: any) => {
          if (!o.value || seen.has(o.value)) return false;
          seen.add(o.value);
          return true;
        });
        setCounterpartyOptions(unique);
      } catch (err) {
        console.warn('[wizard] counterparty load failed', err);
      } finally {
        setLoadingCounterparties(false);
      }
    };
    void load();
  }, [isAdmin, isHospital, isVendor, userData?.hospitalId, userData?.vendorId]);

  // ── Step navigation ─────────────────────────────────────────────────
  const goNext = async () => {
    try {
      if (currentStep === 0) {
        await form.validateFields(['name', 'dates', 'counterparty']);
      }
      if (currentStep === 2 && items.length === 0) {
        message.warning('Add at least one line item before continuing.');
        return;
      }
      setCurrentStep((s) => s + 1);
    } catch {
      // validation error already shown
    }
  };

  const goPrev = () => setCurrentStep((s) => Math.max(0, s - 1));

  // ── File upload ─────────────────────────────────────────────────────
  const onFilePicked = async (file: File) => {
    setContractFile({
      uid: `${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      originFileObj: file as any,
      status: 'uploading',
    } as any);
    setUploadingFile(true);
    try {
      const resp: any = await uploadFile('/uploads', file);
      setUploadedFileKey(resp.url ?? resp.key ?? null);
      setContractFile((prev) => (prev ? { ...prev, status: 'done' } : prev));
      message.success('Contract document uploaded.');
    } catch (err: any) {
      console.warn('[wizard] file upload failed', err);
      message.error(`Upload failed: ${err?.response?.data?.error ?? err.message ?? 'unknown error'}`);
      setContractFile((prev) => (prev ? { ...prev, status: 'error' } : prev));
    } finally {
      setUploadingFile(false);
    }
    return false; // prevent antd auto-upload
  };

  // ── AI extraction ───────────────────────────────────────────────────
  const runExtraction = async () => {
    if (!contractFile?.originFileObj) {
      message.warning('Upload a contract document first.');
      return;
    }
    setExtracting(true);
    try {
      // We need a contract ID to call the extract endpoint. Since the contract
      // is created in step 4, we run a pre-flight: create a draft first if
      // none exists, then extract. To keep step 3 self-contained, we render
      // the PDF page 1 client-side and post the base64 image directly via
      // the existing parse-order endpoint repurposed for contract items.
      //
      // For simplicity here, we shell out to the contract extract endpoint
      // by first creating a placeholder DRAFT, extracting, then carrying it
      // through the wizard. This avoids needing a separate parse-order call.
      const file = contractFile.originFileObj as File;
      let base64: string | null = null;
      if (file.type.startsWith('image/')) {
        base64 = await fileToBase64(file);
      } else {
        message.warning(
          'AI extraction currently requires an image (PNG/JPG) of the pricing-table page. PDFs are stored as the contract document but cannot be auto-extracted yet.',
        );
        setExtracting(false);
        return;
      }

      // We need a contract context to call /contracts/:id/extract-from-pdf.
      // Create a temporary DRAFT contract with whatever the user has entered.
      const formValues = form.getFieldsValue();
      const startDate = formValues.dates?.[0] ? dayjs(formValues.dates[0]).format('YYYY-MM-DD') : null;
      const endDate = formValues.dates?.[1] ? dayjs(formValues.dates[1]).format('YYYY-MM-DD') : null;
      if (!startDate || !endDate) {
        message.warning('Set start + end dates in Step 1 before running AI extraction.');
        setExtracting(false);
        return;
      }
      const counterparty = formValues.counterparty;
      const body: any = {
        name: formValues.name ?? null,
        startDate,
        endDate,
        s3key: uploadedFileKey,
      };
      if (isAdmin) {
        body.hospitalId = formValues.hospitalId ?? null;
        body.vendorId = formValues.vendorId ?? null;
      } else if (isHospital) {
        body.vendorId = counterparty;
      } else if (isVendor) {
        body.hospitalId = counterparty;
      }
      const draft = await contractsApi.create(body);
      const resp = await contractsApi.extractFromPdf(draft.id, base64);
      // Delete the placeholder after extraction (we'll re-create on real submit)
      try {
        await contractsApi.delete(draft.id);
      } catch {
        /* best effort */
      }
      const suggestions: AiContractItemSuggestion[] = resp.suggestions ?? [];
      if (!suggestions.length) {
        message.info('No items could be extracted. Please add them manually in Step 3.');
      } else {
        setItems((prev) => {
          const existingCodes = new Set(prev.map((i) => i.hcpcCode));
          const additions: WizardItem[] = suggestions
            .filter((s) => !existingCodes.has(s.hcpcCode))
            .map((s, idx) => ({
              key: `ai-${Date.now()}-${idx}`,
              hcpcCode: s.hcpcCode,
              description: s.description,
              negotiatedRate: s.rate,
              quantity: s.quantity,
              confidence: s.confidence,
            }));
          return [...prev, ...additions];
        });
        message.success(`Added ${suggestions.length} suggested line items.`);
      }
    } catch (err: any) {
      console.warn('[wizard] extraction failed', err);
      message.error(`Extraction failed: ${err?.response?.data?.error ?? err.message ?? 'unknown'}`);
    } finally {
      setExtracting(false);
    }
  };

  // ── Items editor ────────────────────────────────────────────────────
  const addBlankItem = () => {
    setItems((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        hcpcCode: '',
        description: null,
        negotiatedRate: 0,
        quantity: null,
      },
    ]);
  };

  const updateItem = (key: string, patch: Partial<WizardItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  // ── Submit / Save ───────────────────────────────────────────────────
  const handleSave = async (alsoSubmit: boolean) => {
    try {
      await form.validateFields(['name', 'dates', 'counterparty']);
    } catch {
      message.error('Some required fields are missing. Please go back and complete Step 1.');
      return;
    }
    const values = form.getFieldsValue();
    const startDate = dayjs(values.dates[0]).format('YYYY-MM-DD');
    const endDate = dayjs(values.dates[1]).format('YYYY-MM-DD');

    setSubmitting(true);
    try {
      const body: any = {
        name: values.name,
        startDate,
        endDate,
        s3key: uploadedFileKey,
      };
      if (isAdmin) {
        body.hospitalId = values.hospitalId ?? null;
        body.vendorId = values.vendorId ?? null;
      } else if (isHospital) {
        body.vendorId = values.counterparty;
      } else if (isVendor) {
        body.hospitalId = values.counterparty;
      }
      const created = await contractsApi.create(body);

      // Insert items
      for (const it of items) {
        if (!it.hcpcCode || !it.hcpcCode.trim()) continue;
        try {
          await contractsApi.addItem(created.id, {
            hcpcCode: it.hcpcCode.trim().toUpperCase(),
            description: it.description ?? null,
            negotiatedRate: Number(it.negotiatedRate) || 0,
            quantity: it.quantity,
          });
        } catch (err: any) {
          console.warn('[wizard] failed to add item', it.hcpcCode, err);
        }
      }

      if (alsoSubmit) {
        try {
          await contractsApi.submit(created.id);
          message.success('Contract submitted for approval.');
        } catch (err: any) {
          message.warning(`Contract saved as DRAFT but could not be submitted: ${err?.response?.data?.error ?? err.message}`);
        }
      } else {
        message.success('Contract saved as DRAFT.');
      }
      navigate(`/contracts/${created.id}`);
    } catch (err: any) {
      console.error('[wizard] submit failed', err);
      message.error(`Save failed: ${err?.response?.data?.error ?? err.message ?? 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Steps content ───────────────────────────────────────────────────
  const stepContent = useMemo(() => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <Title level={4}>Parties & Dates</Title>
            <Form form={form} layout="vertical">
              <Form.Item name="name" label="Contract name" rules={[{ required: true, message: 'Please enter a name' }]}>
                <Input placeholder="e.g. MedSupply Pro – Boston General 2026" />
              </Form.Item>
              <Form.Item name="dates" label="Date range" rules={[{ required: true, message: 'Please set start and end dates' }]}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
              {isAdmin ? (
                <>
                  <Form.Item name="hospitalId" label="Hospital ID">
                    <Input placeholder="hospital UUID" />
                  </Form.Item>
                  <Form.Item name="vendorId" label="Vendor ID">
                    <Input placeholder="vendor UUID" />
                  </Form.Item>
                </>
              ) : (
                <Form.Item
                  name="counterparty"
                  label={isHospital ? 'Vendor (counterparty)' : 'Hospital (counterparty)'}
                  rules={[{ required: true, message: 'Please pick a counterparty' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder={isHospital ? 'Choose a vendor you have a relationship with' : 'Choose a hospital you have a relationship with'}
                    options={counterpartyOptions}
                    loading={loadingCounterparties}
                  />
                </Form.Item>
              )}
            </Form>
          </Card>
        );

      case 1:
        return (
          <Card>
            <Title level={4}>Contract Document (optional)</Title>
            <Text type="secondary">
              Upload the signed PDF if you have one. You can also create a contract without a document.
            </Text>
            <Divider />
            <Upload
              beforeUpload={(file) => {
                void onFilePicked(file as File);
                return false;
              }}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              maxCount={1}
              fileList={contractFile ? [contractFile] : []}
              onRemove={() => {
                setContractFile(null);
                setUploadedFileKey(null);
              }}
            >
              <Button icon={<UploadOutlined />} loading={uploadingFile}>Select file</Button>
            </Upload>
            {contractFile && uploadedFileKey && (
              <>
                <Divider />
                <Space>
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={runExtraction}
                    loading={extracting}
                  >
                    Extract line items with AI
                  </Button>
                  <Text type="secondary">Suggestions appear in Step 3 for you to confirm.</Text>
                </Space>
              </>
            )}
          </Card>
        );

      case 2:
        return (
          <Card
            title={<Title level={4} style={{ margin: 0 }}>Line Items</Title>}
            extra={
              <Button icon={<PlusOutlined />} onClick={addBlankItem}>Add row</Button>
            }
          >
            <Table
              dataSource={items}
              rowKey="key"
              pagination={false}
              size="small"
              locale={{ emptyText: 'No items yet — add manually or use AI extraction in Step 2.' }}
              columns={[
                {
                  title: 'HCPC code',
                  dataIndex: 'hcpcCode',
                  width: 130,
                  render: (val, row: WizardItem) => (
                    <Input
                      value={val}
                      onChange={(e) => updateItem(row.key, { hcpcCode: e.target.value })}
                      placeholder="L1832"
                    />
                  ),
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  render: (val, row: WizardItem) => (
                    <Input
                      value={val ?? ''}
                      onChange={(e) => updateItem(row.key, { description: e.target.value })}
                      placeholder="Optional"
                    />
                  ),
                },
                {
                  title: 'Negotiated rate ($)',
                  dataIndex: 'negotiatedRate',
                  width: 160,
                  render: (val, row: WizardItem) => (
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      step={0.01}
                      value={val}
                      onChange={(v) => updateItem(row.key, { negotiatedRate: typeof v === 'number' ? v : 0 })}
                    />
                  ),
                },
                {
                  title: 'Qty cap',
                  dataIndex: 'quantity',
                  width: 100,
                  render: (val, row: WizardItem) => (
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={val ?? undefined}
                      onChange={(v) => updateItem(row.key, { quantity: typeof v === 'number' ? v : null })}
                      placeholder="—"
                    />
                  ),
                },
                {
                  title: 'AI conf.',
                  dataIndex: 'confidence',
                  width: 90,
                  render: (val) =>
                    val ? (
                      <Tag color={val === 'high' ? 'green' : val === 'medium' ? 'gold' : 'red'}>{val}</Tag>
                    ) : null,
                },
                {
                  title: '',
                  width: 50,
                  render: (_v, row: WizardItem) => (
                    <Button
                      size="small"
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => removeItem(row.key)}
                      danger
                    />
                  ),
                },
              ]}
            />
          </Card>
        );

      case 3: {
        const values = form.getFieldsValue();
        const counterpartyLabel =
          counterpartyOptions.find((o) => o.value === values.counterparty)?.label
          ?? values.hospitalId
          ?? values.vendorId
          ?? '—';
        const sumRate = items.reduce((s, i) => s + (Number(i.negotiatedRate) || 0), 0);
        return (
          <Card>
            <Title level={4}>Review & Submit</Title>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Text strong>Name:</Text> <Text>{values.name ?? '—'}</Text>
              </div>
              <div>
                <Text strong>Dates:</Text>{' '}
                <Text>
                  {values.dates?.[0] ? dayjs(values.dates[0]).format('YYYY-MM-DD') : '—'} →{' '}
                  {values.dates?.[1] ? dayjs(values.dates[1]).format('YYYY-MM-DD') : '—'}
                </Text>
              </div>
              <div>
                <Text strong>{isHospital ? 'Vendor' : isVendor ? 'Hospital' : 'Counterparty'}:</Text>{' '}
                <Text>{counterpartyLabel}</Text>
              </div>
              <div>
                <Text strong>Document:</Text>{' '}
                <Text>{contractFile?.name ?? 'No file attached'}</Text>
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <Text strong>{items.length} line items — sum of rates ${sumRate.toFixed(2)}</Text>
              <Table
                dataSource={items}
                rowKey="key"
                pagination={false}
                size="small"
                columns={[
                  { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
                  { title: 'Description', dataIndex: 'description' },
                  {
                    title: 'Rate',
                    dataIndex: 'negotiatedRate',
                    width: 100,
                    render: (v: number) => `$${Number(v).toFixed(2)}`,
                  },
                  { title: 'Qty', dataIndex: 'quantity', width: 80, render: (v) => v ?? '—' },
                ]}
              />
            </Space>
          </Card>
        );
      }
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, items, contractFile, uploadedFileKey, counterpartyOptions, loadingCounterparties, extracting, uploadingFile, isAdmin, isHospital, isVendor, form]);

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Create Contract</Title>
        <Text type="secondary">
          Build a contract step-by-step. You can save it as a draft at any time and come back later.
        </Text>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={currentStep}
          items={[
            { title: 'Parties' },
            { title: 'Document' },
            { title: 'Items' },
            { title: 'Review' },
          ]}
        />
      </Card>

      {stepContent}

      <Card style={{ marginTop: 16 }}>
        <Space>
          <Button onClick={() => navigate('/contract-pricing')}>Cancel</Button>
          {currentStep > 0 && <Button onClick={goPrev}>Back</Button>}
          {currentStep < 3 && (
            <Button type="primary" onClick={goNext}>Next</Button>
          )}
          {currentStep === 3 && (
            <>
              <Button icon={<SaveOutlined />} onClick={() => handleSave(false)} loading={submitting}>
                Save as Draft
              </Button>
              <Tooltip title="Saves the contract and submits it to the counterparty for review">
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleSave(true)}
                  loading={submitting}
                  disabled={items.length === 0}
                >
                  Submit for Approval
                </Button>
              </Tooltip>
            </>
          )}
        </Space>
      </Card>
    </PageWrap>
  );
};

export default AddContractWizard;
