/**
 * DMEPOS compliance admin page.
 *
 *   - Left: vendor list with compliance summary (accredited badge + expiry tag)
 *   - Right: per-vendor drawer with editable fields (NSC, PTAN, NPI, accred
 *     body + expiry, surety bond expiry) + cert docs upload table
 *   - Top: "Expiring soon (30d)" widget showing certs / accreditations that
 *     need renewal
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { get, post, put, del } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const CERT_TYPES = [
  'CMS_ACCREDITATION',
  'SURETY_BOND',
  'NSC',
  'PTAN',
  'NPI',
  'STATE_LICENSE',
  'JOINT_COMMISSION',
  'ACHC',
  'BOC',
  'CHAP',
  'BBB',
  'OTHER',
];

interface VendorRow {
  id: string;
  name: string;
  compliance: any | null;
}

interface ComplianceDoc {
  id: string;
  vendorId: string;
  certType: string;
  certNumber: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  fileName: string | null;
  notes: string | null;
  isActive: number;
}

export const DmeposCompliancePage: React.FC = () => {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ vendor: { id: string; name: string }; compliance: any | null; docs: ComplianceDoc[] } | null>(null);
  const [expiring, setExpiring] = useState<ComplianceDoc[]>([]);
  const [complianceForm] = Form.useForm();
  const [docModal, setDocModal] = useState(false);
  const [docForm] = Form.useForm();

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([
        get<{ items: VendorRow[] }>('/dmepos-compliance'),
        get<{ items: ComplianceDoc[] }>('/dmepos-compliance/expiring', { days: '30' } as any),
      ]);
      setRows(r.items ?? []);
      setExpiring(e.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetchAll(); }, []);

  const openVendor = async (vendorId: string) => {
    try {
      const r = await get<any>(`/dmepos-compliance/vendor/${vendorId}`);
      setDetail(r);
      complianceForm.setFieldsValue({
        nscNumber: r.compliance?.nscNumber,
        ptan: r.compliance?.ptan,
        npi: r.compliance?.npi,
        accredited: !!r.compliance?.accredited,
        accreditationBody: r.compliance?.accreditationBody,
        accreditationExpiresAt: r.compliance?.accreditationExpiresAt ? dayjs(r.compliance.accreditationExpiresAt) : null,
        suretyBondExpiresAt: r.compliance?.suretyBondExpiresAt ? dayjs(r.compliance.suretyBondExpiresAt) : null,
      });
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const saveCompliance = async () => {
    if (!detail) return;
    try {
      const v = await complianceForm.validateFields();
      await put(`/dmepos-compliance/vendor/${detail.vendor.id}`, {
        ...v,
        accreditationExpiresAt: v.accreditationExpiresAt ? dayjs(v.accreditationExpiresAt).format('YYYY-MM-DD') : null,
        suretyBondExpiresAt: v.suretyBondExpiresAt ? dayjs(v.suretyBondExpiresAt).format('YYYY-MM-DD') : null,
      });
      message.success('Compliance updated');
      await openVendor(detail.vendor.id);
      void fetchAll();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const addDoc = async () => {
    if (!detail) return;
    try {
      const v = await docForm.validateFields();
      await post(`/dmepos-compliance/vendor/${detail.vendor.id}/docs`, {
        certType: v.certType,
        certNumber: v.certNumber,
        issuingAuthority: v.issuingAuthority,
        issueDate: v.issueDate ? dayjs(v.issueDate).format('YYYY-MM-DD') : null,
        expirationDate: v.expirationDate ? dayjs(v.expirationDate).format('YYYY-MM-DD') : null,
        fileName: v.fileName,
        notes: v.notes,
      });
      message.success('Cert added');
      setDocModal(false);
      docForm.resetFields();
      await openVendor(detail.vendor.id);
      void fetchAll();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const removeDoc = async (docId: string) => {
    if (!detail) return;
    await del(`/dmepos-compliance/docs/${docId}`);
    message.success('Cert removed');
    await openVendor(detail.vendor.id);
    void fetchAll();
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const accredited = rows.filter((r) => r.compliance?.accredited).length;
    return { total, accredited, expiring: expiring.length };
  }, [rows, expiring]);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>DMEPOS Supplier Compliance</Title>
          <Text type="secondary">
            Track Medicare DMEPOS accreditation, surety bonds, NSC #, PTAN, NPI, and other certifications per vendor.
          </Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchAll()}>Refresh</Button>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total vendors" value={stats.total} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="DMEPOS accredited"
              value={stats.accredited}
              suffix={`/ ${stats.total}`}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Expiring in 30 days"
              value={stats.expiring}
              valueStyle={{ color: stats.expiring > 0 ? '#cf1322' : '#52c41a' }}
              prefix={stats.expiring > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {expiring.length > 0 && (
        <Card size="small" title="Certs expiring soon" style={{ marginBottom: 16 }}>
          <Table<ComplianceDoc>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={expiring}
            columns={[
              { title: 'Vendor', dataIndex: 'vendorId', render: (vid) => rows.find((r) => r.id === vid)?.name ?? vid },
              { title: 'Cert type', dataIndex: 'certType', render: (t) => <Tag>{t.replace('_', ' ')}</Tag> },
              { title: 'Cert #', dataIndex: 'certNumber' },
              {
                title: 'Expires',
                dataIndex: 'expirationDate',
                render: (v: string | null) => {
                  if (!v) return '—';
                  const days = dayjs(v).diff(dayjs(), 'day');
                  return (
                    <Space>
                      <span>{dayjs(v).format('MMM D, YYYY')}</span>
                      <Tag color={days <= 0 ? 'red' : days < 14 ? 'orange' : 'gold'}>{days <= 0 ? 'EXPIRED' : `${days}d`}</Tag>
                    </Space>
                  );
                },
              },
              {
                title: '',
                render: (_, r) => (
                  <Button size="small" onClick={() => openVendor(r.vendorId)}>Open vendor</Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Card size="small" title="All vendors">
        <Table<VendorRow>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={[
            { title: 'Vendor', dataIndex: 'name', render: (n, r) => <a onClick={() => openVendor(r.id)}><strong>{n}</strong></a> },
            {
              title: 'DMEPOS accredited',
              dataIndex: ['compliance', 'accredited'],
              width: 160,
              render: (a: number | undefined) =>
                a ? <Tag color="green" icon={<SafetyCertificateOutlined />}>Accredited</Tag> : <Tag>Not on file</Tag>,
            },
            {
              title: 'Accred body',
              dataIndex: ['compliance', 'accreditationBody'],
              width: 140,
              render: (v: string | undefined) => v ?? <Text type="secondary">—</Text>,
            },
            { title: 'NSC #', dataIndex: ['compliance', 'nscNumber'], width: 110 },
            { title: 'PTAN', dataIndex: ['compliance', 'ptan'], width: 110 },
            { title: 'NPI', dataIndex: ['compliance', 'npi'], width: 120 },
            {
              title: 'Accred expires',
              dataIndex: ['compliance', 'accreditationExpiresAt'],
              width: 130,
              render: (v: string | undefined) => v ? dayjs(v).format('MMM D, YYYY') : '—',
            },
            {
              title: 'Bond expires',
              dataIndex: ['compliance', 'suretyBondExpiresAt'],
              width: 130,
              render: (v: string | undefined) => v ? dayjs(v).format('MMM D, YYYY') : '—',
            },
          ]}
          pagination={{ pageSize: 25 }}
        />
      </Card>

      <Drawer
        title={detail ? `Compliance — ${detail.vendor.name}` : ''}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={720}
      >
        {detail && (
          <Tabs
            items={[
              {
                key: 'summary',
                label: 'Compliance summary',
                children: (
                  <Form form={complianceForm} layout="vertical">
                    <Row gutter={12}>
                      <Col span={8}><Form.Item name="nscNumber" label="NSC #"><Input /></Form.Item></Col>
                      <Col span={8}><Form.Item name="ptan" label="PTAN"><Input /></Form.Item></Col>
                      <Col span={8}><Form.Item name="npi" label="NPI"><Input /></Form.Item></Col>
                    </Row>
                    <Row gutter={12}>
                      <Col span={6}>
                        <Form.Item name="accredited" label="DMEPOS accredited" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name="accreditationBody" label="Accreditation body">
                          <Select
                            allowClear
                            options={[
                              { value: 'ACHC', label: 'ACHC' },
                              { value: 'BOC', label: 'BOC' },
                              { value: 'CHAP', label: 'CHAP' },
                              { value: 'Joint Commission', label: 'Joint Commission' },
                              { value: 'BBB', label: 'BBB' },
                              { value: 'Other', label: 'Other' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="accreditationExpiresAt" label="Accred expires">
                          <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="suretyBondExpiresAt" label="Surety bond expires">
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Button type="primary" onClick={saveCompliance}>Save compliance</Button>
                  </Form>
                ),
              },
              {
                key: 'docs',
                label: `Certificates (${detail.docs.length})`,
                children: (
                  <>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { docForm.resetFields(); setDocModal(true); }} style={{ marginBottom: 12 }}>
                      Add certificate
                    </Button>
                    {detail.docs.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No certificates on file" />
                    ) : (
                      <Table<ComplianceDoc>
                        size="small"
                        rowKey="id"
                        pagination={false}
                        dataSource={detail.docs}
                        columns={[
                          { title: 'Type', dataIndex: 'certType', render: (t) => <Tag>{t.replace('_', ' ')}</Tag> },
                          { title: 'Number', dataIndex: 'certNumber' },
                          { title: 'Issued', dataIndex: 'issueDate', render: (v) => v ? dayjs(v).format('MMM D, YYYY') : '—' },
                          {
                            title: 'Expires',
                            dataIndex: 'expirationDate',
                            render: (v: string | null) => {
                              if (!v) return '—';
                              const days = dayjs(v).diff(dayjs(), 'day');
                              return (
                                <Space>
                                  <span>{dayjs(v).format('MMM D, YYYY')}</span>
                                  {days <= 0 ? <Tag color="red">EXPIRED</Tag> : days < 30 ? <Tag color="orange">{days}d</Tag> : null}
                                </Space>
                              );
                            },
                          },
                          {
                            title: '',
                            width: 50,
                            render: (_, r) => (
                              <Popconfirm title="Remove certificate?" onConfirm={() => removeDoc(r.id)}>
                                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                              </Popconfirm>
                            ),
                          },
                        ]}
                      />
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
      </Drawer>

      <Modal
        title="Add certificate"
        open={docModal}
        onCancel={() => setDocModal(false)}
        onOk={addDoc}
        okText="Add"
      >
        <Form form={docForm} layout="vertical">
          <Form.Item name="certType" label="Certificate type" rules={[{ required: true }]}>
            <Select options={CERT_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))} />
          </Form.Item>
          <Form.Item name="certNumber" label="Cert / license number"><Input /></Form.Item>
          <Form.Item name="issuingAuthority" label="Issuing authority"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="issueDate" label="Issue date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="expirationDate" label="Expiration date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="fileName" label="File name (after R2 upload)"><Input placeholder="cert.pdf" /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </PageWrap>
  );
};

export default DmeposCompliancePage;
