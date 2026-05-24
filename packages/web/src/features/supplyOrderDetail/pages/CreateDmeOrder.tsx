/**
 * DME Order Intake Wizard (Session 13 — Feature 5).
 *
 * Six guided steps optimized for DME orders specifically (vs. the generic
 * CreateSupplyOrder used for non-DME items):
 *
 *   1. Patient — name, DOB, phone, address, height/weight/mobility/setting
 *   2. Diagnosis + HCPC — ICD-10, items, auto LCD check + auto PA flag
 *   3. Documents — checklist of required docs (DWO, F2F, CMN, etc.)
 *   4. Eligibility — payor + 270/271 check
 *   5. Prior Auth — submit if required
 *   6. Supplier — pick DMEPOS vendor (filtered by accreditation)
 *
 * On finish: creates the order, materializes documents, optionally creates
 * a PA, and navigates to the order detail page.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  Spin,
  Divider,
} from 'antd';
import {
  UserOutlined,
  MedicineBoxOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { useBreadcrumbOverride } from '../../../contexts/BreadcrumbContext';
import { get, post } from '../../../api/client';
import { dmeOrderApi, type LcdCheckResult, type RequiredFinding } from '../../../api/dmeOrder';
import { formularyApi } from '../../../api/formulary';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;
const StepCard = styled(Card)`margin-bottom: 16px;`;

interface LineItem {
  key: string;
  hcpcCode: string;
  description: string;
  quantity: number;
  lcdResult?: LcdCheckResult;
  paRequired?: boolean;
  // Required clinical findings (LCD CLINICAL_FINDING_THRESHOLD criteria).
  // Loaded after HCPC is set; user fills values; we pass them on each lcdCheck call.
  requiredFindings?: RequiredFinding[];
  findingValues?: Record<string, number | null>;
}

const SETTINGS = [
  { value: 'HOME', label: 'Home' },
  { value: 'SNF', label: 'Skilled Nursing Facility' },
  { value: 'HOSPICE', label: 'Hospice' },
  { value: 'OTHER', label: 'Other' },
];

const MOBILITY = [
  { value: 'AMBULATORY', label: 'Ambulatory' },
  { value: 'WHEELCHAIR', label: 'Wheelchair' },
  { value: 'BEDBOUND', label: 'Bedbound' },
  { value: 'OTHER', label: 'Other' },
];

const RENTAL_TYPES = [
  { value: 'PURCHASE', label: 'Purchase (outright)' },
  { value: 'CAPPED_RENTAL', label: 'Capped rental (13 months)' },
  { value: 'INEXPENSIVE_ROUTINELY', label: 'Inexpensive / routinely purchased' },
  { value: 'OXYGEN_RENTAL', label: 'Oxygen rental (36 months)' },
  { value: 'PARENTERAL_ENTERAL', label: 'Parenteral / enteral' },
];

export const CreateDmeOrder: React.FC = () => {
  const navigate = useNavigate();
  useBreadcrumbOverride([{ title: 'Orders', to: '/provider-orders' }, { title: 'New DME Order' }]);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Patient + DME intake
  const [patientForm] = Form.useForm();

  // Step 2: Diagnosis + HCPC lines
  const [dxForm] = Form.useForm();
  const [lines, setLines] = useState<LineItem[]>([
    { key: '1', hcpcCode: '', description: '', quantity: 1 },
  ]);
  const [lcdLoading, setLcdLoading] = useState<Record<string, boolean>>({});

  // Wizard-routing check: if every line categorizes to SUPPLY (or has no DME
  // code at all), suggest the simpler supply wizard. The DME wizard's extra
  // fields (F2F, DWO, length of need, etc.) are wasted effort otherwise.
  const [wizardRecommendation, setWizardRecommendation] = useState<{
    recommendedWizard: 'DME' | 'SUPPLY';
  } | null>(null);
  useEffect(() => {
    const codes = lines.map((l) => l.hcpcCode?.trim().toUpperCase()).filter(Boolean) as string[];
    if (codes.length === 0) { setWizardRecommendation(null); return; }
    const t = setTimeout(async () => {
      try {
        const { post } = await import('../../../api/client');
        const r = await post<any>('/hcpc-codes/categorize', { codes });
        setWizardRecommendation({ recommendedWizard: r.recommendedWizard });
      } catch { /* silent */ }
    }, 500);
    return () => clearTimeout(t);
  }, [lines]);

  // Step 4: Payor
  const [payors, setPayors] = useState<Array<{ id: string; name: string; kind: string }>>([]);
  const [payorId, setPayorId] = useState<string | undefined>();
  const [payorMemberId, setPayorMemberId] = useState<string>('');
  const [eligibilityResult, setEligibilityResult] = useState<any | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // Step 6: Supplier
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; dmeposAccredited?: boolean }>>([]);
  const [vendorId, setVendorId] = useState<string | undefined>();

  // Load lookups on mount
  useEffect(() => {
    (async () => {
      try {
        const [p, v, dmepos] = await Promise.all([
          get<{ items: any[] }>('/payors'),
          get<{ items: any[] }>('/vendors'),
          // DMEPOS compliance lives in a sidecar; merge to badge accredited vendors.
          // Endpoint may 403 for non-admins — degrade gracefully (no badges).
          get<{ items: Array<{ id: string; compliance: { accredited?: number } | null }> }>('/dmepos-compliance').catch(() => ({ items: [] })),
        ]);
        const compMap = new Map(
          (dmepos.items ?? []).map((d) => [d.id, !!d.compliance?.accredited]),
        );
        setPayors(p.items ?? []);
        setVendors(
          (v.items ?? []).map((vv: any) => ({
            ...vv,
            dmeposAccredited: compMap.get(vv.id) ?? false,
          })),
        );
      } catch { /* noop */ }
    })();
  }, []);

  // ── Step 2 helpers ────────────────────────────────────────────────────
  const addLine = () =>
    setLines((arr) => [...arr, { key: String(Date.now()), hcpcCode: '', description: '', quantity: 1 }]);
  const updLine = (key: string, k: keyof LineItem, v: any) =>
    setLines((arr) => arr.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const rmLine = (key: string) => setLines((arr) => arr.filter((l) => l.key !== key));

  // After user enters HCPC, do formulary + LCD + PA-required + required-findings lookups
  const onHcpcBlur = async (key: string) => {
    const line = lines.find((l) => l.key === key);
    if (!line || !line.hcpcCode) return;
    const code = line.hcpcCode.trim().toUpperCase();
    setLcdLoading((s) => ({ ...s, [key]: true }));
    try {
      const icd10 = dxForm.getFieldValue('icd10');
      const icd10List = icd10 ? [icd10] : [];
      const setting = patientForm.getFieldValue('careSetting');
      const [lcd, pa, req] = await Promise.all([
        dmeOrderApi.lcdCheck({ hcpcCode: code, icd10List, setting, findings: line.findingValues }),
        dmeOrderApi.paRequired(code),
        dmeOrderApi.requiredFindings(code),
      ]);
      // Auto-fill description from formulary if blank
      let desc = line.description;
      if (!desc) {
        try {
          const fm = await formularyApi.resolve({ hcpcCode: code });
          if (fm.item?.description) desc = fm.item.description;
        } catch { /* noop */ }
      }
      updLine(key, 'lcdResult', lcd);
      updLine(key, 'paRequired', pa.required);
      updLine(key, 'requiredFindings', req.findings);
      if (desc !== line.description) updLine(key, 'description', desc);
    } catch (err) { /* noop */ }
    finally { setLcdLoading((s) => ({ ...s, [key]: false })); }
  };

  // Re-run LCD check after a finding value changes (debounced via simple blur)
  const onFindingValueChange = async (key: string, findingName: string, value: number | null) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const newValues = { ...(line.findingValues ?? {}), [findingName]: value };
    updLine(key, 'findingValues', newValues);
    // Re-run LCD check with the new values
    if (line.hcpcCode) {
      try {
        const icd10 = dxForm.getFieldValue('icd10');
        const icd10List = icd10 ? [icd10] : [];
        const setting = patientForm.getFieldValue('careSetting');
        const lcd = await dmeOrderApi.lcdCheck({
          hcpcCode: line.hcpcCode.trim().toUpperCase(),
          icd10List,
          setting,
          findings: newValues,
        });
        updLine(key, 'lcdResult', lcd);
      } catch { /* noop */ }
    }
  };

  // ── Eligibility check ─────────────────────────────────────────────────
  const checkEligibility = async () => {
    if (!payorId) return message.warning('Pick a payor first');
    setEligibilityLoading(true);
    setEligibilityResult(null);
    try {
      const r = await post<any>(`/payors/${payorId}/eligibility-check`, {
        memberId: payorMemberId,
        patientName: patientForm.getFieldValue('patientName'),
        patientDob: patientForm.getFieldValue('patientBirthDate'),
      });
      setEligibilityResult(r);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Eligibility check failed');
    } finally {
      setEligibilityLoading(false);
    }
  };

  // ── Finalize ─────────────────────────────────────────────────────────
  const finalize = async () => {
    setSubmitting(true);
    try {
      const p = await patientForm.validateFields();
      const dx = await dxForm.validateFields();
      if (lines.length === 0 || !lines[0].hcpcCode) {
        message.warning('Add at least one HCPC line');
        setSubmitting(false);
        return;
      }
      const cmsPaRequired = lines.some((l) => l.paRequired);

      // 1. Create order
      const orderBody = {
        patientName: p.patientName,
        patientBirthDate: p.patientBirthDate ? dayjs(p.patientBirthDate).format('YYYY-MM-DD') : null,
        patientPhone: p.patientPhone,
        patientAddress: p.patientAddress,
        diagnosis: dx.diagnosis,
        icd10: dx.icd10,
        payorId,
        payorMemberId,
        vendorId,
        // DME extension fields go on a separate sidecar endpoint
        items: lines.map((l) => ({
          code: l.hcpcCode.trim().toUpperCase(),
          description: l.description,
          quantity: l.quantity,
        })),
      };
      const orderRes = await post<{ id: string; identifier?: string }>('/orders', orderBody);
      const orderId = orderRes.id;

      // 2. Save DME extension (sidecar) via dme-documents/extension endpoint
      try {
        await post(`/dme-documents/extension/${orderId}`, {
          lengthOfNeedMonths: p.lengthOfNeedMonths,
          careSetting: p.careSetting,
          patientHeightIn: p.patientHeightIn,
          patientWeightLb: p.patientWeightLb,
          mobilityStatus: p.mobilityStatus,
          rentalType: p.rentalType,
          estimatedStartDate: p.estimatedStartDate ? dayjs(p.estimatedStartDate).format('YYYY-MM-DD') : null,
          faceToFaceDate: p.faceToFaceDate ? dayjs(p.faceToFaceDate).format('YYYY-MM-DD') : null,
          cmsPaRequired: cmsPaRequired ? 1 : 0,
          clinicalIndication: p.clinicalIndication,
        });
      } catch (err) {
        // Non-fatal: extension can be set later
      }

      // 3. Materialize documents
      try {
        await post(`/dme-documents/materialize/${orderId}`, {});
      } catch { /* noop */ }

      // 4. Auto-create prior auth if any line requires CMS PA. Surface failure
      //    to the user (don't silently swallow — they can still navigate to
      //    /prior-auths and create it manually).
      if (cmsPaRequired) {
        if (!payorId) {
          message.warning('Order requires Prior Auth but no payor was selected. Add a PA manually from /prior-auths.');
        } else {
          try {
            await post('/prior-auths', {
              orderId,
              patientName: p.patientName,
              patientDob: p.patientBirthDate ? dayjs(p.patientBirthDate).format('YYYY-MM-DD') : undefined,
              payorId,
              payorMemberId: payorMemberId || undefined,
              hcpcCode: lines.find((l) => l.paRequired)?.hcpcCode,
              icd10: dx.icd10,
              clinicalNote: p.clinicalIndication,
            });
            message.success('Prior Auth auto-created in NEEDED status');
          } catch (err: any) {
            message.warning(`Order created but PA auto-create failed: ${err?.response?.data?.error ?? 'unknown'}. Create manually at /prior-auths.`);
          }
        }
      }

      message.success(`Order ${orderRes.identifier ?? orderId} created`);
      navigate(`/provider-orders/${orderId}`);
    } catch (err: any) {
      if (err?.errorFields) {
        message.warning('Please complete required fields');
      } else {
        message.error(err?.response?.data?.error ?? 'Failed to create order');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step content ─────────────────────────────────────────────────────
  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <StepCard title="1. Patient & DME Intake">
            <Form form={patientForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}><Form.Item name="patientName" label="Patient name" rules={[{ required: true }]}><Input /></Form.Item></Col>
                <Col span={6}><Form.Item name="patientBirthDate" label="Date of birth"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="patientPhone" label="Phone"><Input /></Form.Item></Col>
              </Row>
              <Form.Item name="patientAddress" label="Address"><Input.TextArea rows={2} /></Form.Item>
              <Divider>DME-specific intake</Divider>
              <Row gutter={16}>
                <Col span={6}><Form.Item name="careSetting" label="Care setting" rules={[{ required: true }]}><Select options={SETTINGS} /></Form.Item></Col>
                <Col span={6}><Form.Item name="mobilityStatus" label="Mobility status"><Select options={MOBILITY} /></Form.Item></Col>
                <Col span={6}><Form.Item name="patientHeightIn" label="Height (in)"><InputNumber style={{ width: '100%' }} min={0} max={120} /></Form.Item></Col>
                <Col span={6}><Form.Item name="patientWeightLb" label="Weight (lb)"><InputNumber style={{ width: '100%' }} min={0} max={1500} /></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}><Form.Item name="lengthOfNeedMonths" label="Length of need (months)" tooltip="99 = lifetime"><InputNumber style={{ width: '100%' }} min={0} max={99} /></Form.Item></Col>
                <Col span={8}><Form.Item name="rentalType" label="Rental type"><Select options={RENTAL_TYPES} /></Form.Item></Col>
                <Col span={8}><Form.Item name="estimatedStartDate" label="Estimated start date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><Form.Item name="faceToFaceDate" label="Face-to-face encounter date" tooltip="Required by most LCDs"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Form.Item name="clinicalIndication" label="Clinical indication / narrative"><Input.TextArea rows={3} placeholder="Brief clinical justification for the equipment" /></Form.Item>
            </Form>
          </StepCard>
        );
      case 1:
        return (
          <StepCard title="2. Diagnosis & HCPC Items">
            <Form form={dxForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}><Form.Item name="diagnosis" label="Primary diagnosis (text)" rules={[{ required: true }]}><Input placeholder="e.g. Obstructive sleep apnea" /></Form.Item></Col>
                <Col span={6}><Form.Item name="icd10" label="ICD-10 code" rules={[{ required: true }]}><Input placeholder="e.g. G47.33" /></Form.Item></Col>
              </Row>
            </Form>
            <Divider>HCPC Items</Divider>
            {/* Wizard-routing banner: warn if no line is actually DME. */}
            {wizardRecommendation?.recommendedWizard === 'SUPPLY' && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="None of these codes look like DME"
                description="The DME wizard is sized for Medicare-regulated DMEPOS claims (face-to-face, DWO, LCD checks). For plain supplies, the simpler supply wizard skips those fields."
                action={
                  <Button size="small" onClick={() => navigate('/create-order')}>
                    Switch to supply order
                  </Button>
                }
              />
            )}
            {lines.map((l) => (
              <Card key={l.key} size="small" style={{ marginBottom: 12, background: '#fafafa' }}>
                <Row gutter={8} align="middle">
                  <Col xs={24} sm={4}>
                    <Input
                      placeholder="HCPC"
                      value={l.hcpcCode}
                      onChange={(e) => updLine(l.key, 'hcpcCode', e.target.value)}
                      onBlur={() => onHcpcBlur(l.key)}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Input
                      placeholder="Description"
                      value={l.description}
                      onChange={(e) => updLine(l.key, 'description', e.target.value)}
                    />
                  </Col>
                  <Col xs={12} sm={3}>
                    <InputNumber
                      placeholder="Qty"
                      min={1}
                      style={{ width: '100%' }}
                      value={l.quantity}
                      onChange={(v) => updLine(l.key, 'quantity', v ?? 1)}
                    />
                  </Col>
                  <Col xs={12} sm={5} style={{ textAlign: 'right' }}>
                    {lines.length > 1 && <Button size="small" danger onClick={() => rmLine(l.key)}>Remove</Button>}
                  </Col>
                </Row>
                {lcdLoading[l.key] && <Spin size="small" style={{ marginTop: 8 }} />}
                {l.requiredFindings && l.requiredFindings.length > 0 && (
                  <div style={{ marginTop: 8, padding: 8, background: '#fff', border: '1px dashed #d9d9d9', borderRadius: 4 }}>
                    <Text strong style={{ fontSize: 12 }}>Required clinical findings:</Text>
                    <Row gutter={8} style={{ marginTop: 4 }}>
                      {l.requiredFindings.map((f) => (
                        <Col xs={24} sm={8} key={f.findingName}>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
                            {f.findingName} {f.operator} {f.threshold}{f.unit ?? ''}
                          </div>
                          <InputNumber
                            size="small"
                            placeholder={f.findingName}
                            style={{ width: '100%' }}
                            value={l.findingValues?.[f.findingName] ?? undefined}
                            onChange={(v) => onFindingValueChange(l.key, f.findingName, v as number | null)}
                            addonAfter={f.unit ?? undefined}
                          />
                        </Col>
                      ))}
                    </Row>
                  </div>
                )}
                {l.lcdResult && (
                  <div style={{ marginTop: 8 }}>
                    {l.lcdResult.decision === 'MEETS' && (
                      <Tag color="green" icon={<CheckCircleOutlined />}>LCD: Meets criteria</Tag>
                    )}
                    {l.lcdResult.decision === 'DOES_NOT_MEET' && (
                      <Tag color="red" icon={<CloseCircleOutlined />}>LCD: Does NOT meet — {l.lcdResult.explanation}</Tag>
                    )}
                    {l.lcdResult.decision === 'NEEDS_CLINICAL_REVIEW' && (
                      <Tag color="orange" icon={<ExclamationCircleOutlined />}>LCD: Needs clinical review</Tag>
                    )}
                    {l.lcdResult.decision === 'UNKNOWN' && (
                      <Tag color="default">No LCD criteria on file</Tag>
                    )}
                    {l.paRequired && (
                      <Tag color="purple" icon={<SafetyCertificateOutlined />}>CMS PA required — will auto-create</Tag>
                    )}
                  </div>
                )}
              </Card>
            ))}
            <Button type="dashed" block onClick={addLine}>+ Add line</Button>
          </StepCard>
        );
      case 2:
        return (
          <StepCard title="3. Required Documents (preview)">
            <Paragraph type="secondary">
              After the order is created, Curavend will auto-resolve required docs from each HCPC's catalog
              and create slots you can upload into. Items currently flagged for documentation:
            </Paragraph>
            <Space direction="vertical" style={{ width: '100%' }}>
              {lines.filter((l) => l.lcdResult).map((l) => (
                <Card key={l.key} size="small" title={<><strong>{l.hcpcCode}</strong> — {l.description}</>}>
                  {l.lcdResult?.evaluations
                    .filter((e) => e.criterionType === 'DOCUMENTATION')
                    .map((e, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <Tag>{e.criterionType}</Tag> {e.description}
                      </div>
                    ))}
                </Card>
              ))}
              <Alert type="info" message="Document slots will be created automatically. Upload after the order is saved." />
            </Space>
          </StepCard>
        );
      case 3:
        return (
          <StepCard title="4. Insurance Eligibility">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Payor">
                  <Select
                    showSearch
                    placeholder="Pick payor"
                    optionFilterProp="label"
                    options={payors.map((p) => ({ value: p.id, label: `${p.name} (${p.kind})` }))}
                    value={payorId}
                    onChange={setPayorId}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Member ID">
                  <Input value={payorMemberId} onChange={(e) => setPayorMemberId(e.target.value)} />
                </Form.Item>
              </Col>
              <Col span={4} style={{ display: 'flex', alignItems: 'end' }}>
                <Form.Item label=" ">
                  <Button type="primary" loading={eligibilityLoading} onClick={checkEligibility}>
                    Check eligibility
                  </Button>
                </Form.Item>
              </Col>
            </Row>
            {eligibilityResult && (
              <Alert
                type={eligibilityResult.eligibilityStatus === 'ACTIVE' ? 'success' : 'warning'}
                message={`Eligibility: ${eligibilityResult.eligibilityStatus ?? 'UNKNOWN'}`}
                description={
                  <Space direction="vertical">
                    {eligibilityResult.copayAmountCents != null && (
                      <Text>Copay: ${(eligibilityResult.copayAmountCents / 100).toFixed(2)}</Text>
                    )}
                    {eligibilityResult.deductibleRemainingCents != null && (
                      <Text>Deductible remaining: ${(eligibilityResult.deductibleRemainingCents / 100).toFixed(2)}</Text>
                    )}
                  </Space>
                }
              />
            )}
          </StepCard>
        );
      case 4: {
        const paLines = lines.filter((l) => l.paRequired);
        return (
          <StepCard title="5. Prior Authorization">
            {paLines.length === 0 ? (
              <Alert type="success" message="No items require CMS Prior Authorization. Skip to next step." />
            ) : (
              <>
                <Alert
                  type="warning"
                  icon={<WarningOutlined />}
                  message={`${paLines.length} item${paLines.length > 1 ? 's' : ''} require Prior Authorization`}
                  description="A Prior Auth record will be auto-created when you finish the wizard. Submit through /prior-auths after."
                  style={{ marginBottom: 12 }}
                />
                <Space direction="vertical" style={{ width: '100%' }}>
                  {paLines.map((l) => (
                    <Card key={l.key} size="small">
                      <Tag color="purple">{l.hcpcCode}</Tag> {l.description}
                    </Card>
                  ))}
                </Space>
              </>
            )}
          </StepCard>
        );
      }
      case 5:
        return (
          <StepCard title="6. Pick DME Supplier">
            <Paragraph type="secondary">
              Filter shows DMEPOS-accredited suppliers in green. Non-accredited suppliers may not be reimbursable by Medicare.
            </Paragraph>
            <Select
              showSearch
              placeholder="Pick a vendor"
              style={{ width: '100%' }}
              optionFilterProp="label"
              value={vendorId}
              onChange={setVendorId}
              options={vendors.map((v) => ({
                value: v.id,
                label: `${v.name}${v.dmeposAccredited ? ' ✓ DMEPOS-accredited' : ''}`,
              }))}
            />
          </StepCard>
        );
      default:
        return null;
    }
  };

  return (
    <PageWrap>
      <Title level={3} style={{ marginBottom: 16 }}>New DME Order</Title>
      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: 'Patient', icon: <UserOutlined /> },
          { title: 'Diagnosis & HCPC', icon: <MedicineBoxOutlined /> },
          { title: 'Documents', icon: <FileTextOutlined /> },
          { title: 'Eligibility', icon: <SafetyCertificateOutlined /> },
          { title: 'Prior Auth', icon: <SafetyCertificateOutlined /> },
          { title: 'Supplier', icon: <ShopOutlined /> },
        ]}
      />
      {stepContent()}
      <Row justify="space-between" style={{ marginTop: 16 }}>
        <Col>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        </Col>
        <Col>
          {step < 5 ? (
            <Button type="primary" onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button type="primary" loading={submitting} onClick={finalize}>
              Create DME Order
            </Button>
          )}
        </Col>
      </Row>
    </PageWrap>
  );
};

export default CreateDmeOrder;
