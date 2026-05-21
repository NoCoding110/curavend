/**
 * Best-price quick lookup — enter (vendor, HCPC) and see the resolved rate
 * + source. Also supports bulk lookup via comma/newline-separated list.
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Input,
  Button,
  Space,
  Table,
  Tag,
  Select,
  message,
  Row,
  Col,
  Alert,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { pricingApi, type PriceResult } from '../../../api/pricing';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const PriceLookup: React.FC = () => {
  const { isAdmin, isHospital, isVendor, userData } = useUserRoles();
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [hospitalId, setHospitalId] = useState<string>(userData?.hospitalId ?? '');
  const [vendorId, setVendorId] = useState<string>(userData?.vendorId ?? '');
  const [hcpcInput, setHcpcInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ hcpc: string } & Partial<PriceResult>>>([]);

  useEffect(() => {
    if (isHospital && userData?.hospitalId) {
      get<any>('/hospital-vendors', { hospitalId: userData.hospitalId, approvalStatus: 'APPROVED', limit: 200 })
        .then((r) => {
          const rows = r?.items ?? r ?? [];
          const opts = Array.isArray(rows) ? rows : [];
          const seen = new Set<string>();
          const list: Array<{ id: string; name: string }> = [];
          opts.forEach((row: any) => {
            const id = row.vendorId;
            const name = row.vendor?.name ?? row.vendorName ?? id;
            if (id && !seen.has(id)) { seen.add(id); list.push({ id, name }); }
          });
          setVendors(list);
        })
        .catch(() => { /* silent */ });
    } else if (isVendor && userData?.vendorId) {
      setVendorId(userData.vendorId);
    }
  }, [isHospital, isVendor, userData?.hospitalId, userData?.vendorId]);

  const handleLookup = async () => {
    if (!hospitalId || !vendorId) {
      message.warning('Hospital and vendor are required');
      return;
    }
    const codes = hcpcInput
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toUpperCase());
    if (codes.length === 0) {
      message.warning('Enter one or more HCPC codes');
      return;
    }
    setLoading(true);
    try {
      const resp = await pricingApi.rates({ hospitalId, vendorId, hcpcCodes: codes });
      const out = codes.map((code) => {
        const r = resp.rates[code];
        return { hcpc: code, rate: r?.rate ?? null, source: (r?.source as any) ?? null, contractId: r?.contractId ?? null, currency: r?.currency ?? 'USD' };
      });
      setResults(out);
    } catch (err: any) {
      message.error(`Lookup failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Price Lookup</Title>
        <Text type="secondary">
          Look up negotiated rates for one or more HCPC codes. Resolves CONTRACT → MEDICARE → null.
        </Text>
      </Card>

      <Card>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Text strong>Hospital</Text>
            {isHospital && userData?.hospitalId ? (
              <Input value={userData.hospitalId} disabled />
            ) : (
              <Input value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} placeholder="Hospital ID" />
            )}
          </Col>
          <Col xs={24} md={8}>
            <Text strong>Vendor</Text>
            {vendors.length > 0 ? (
              <Select
                style={{ width: '100%' }}
                value={vendorId || undefined}
                onChange={setVendorId}
                placeholder="Pick vendor"
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                showSearch
                optionFilterProp="label"
              />
            ) : (
              <Input value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="Vendor ID" />
            )}
          </Col>
          <Col xs={24} md={8}>
            <Text strong>HCPC Codes</Text>
            <Input.TextArea
              rows={3}
              placeholder="L1832, A4595, L0631 (comma or newline separated)"
              value={hcpcInput}
              onChange={(e) => setHcpcInput(e.target.value)}
            />
          </Col>
        </Row>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleLookup} loading={loading}>
            Look up rates
          </Button>
        </Space>
      </Card>

      {results.length > 0 && (
        <Card style={{ marginTop: 16 }} title="Results">
          <Table
            dataSource={results.map((r, i) => ({ ...r, key: i }))}
            pagination={false}
            size="small"
            columns={[
              { title: 'HCPC', dataIndex: 'hcpc', width: 120 },
              {
                title: 'Rate', dataIndex: 'rate', width: 160, align: 'right',
                render: (v: number | null, r: any) => v != null
                  ? <Text strong>${v.toFixed(2)} <Text type="secondary" style={{ fontSize: 10 }}>{r.currency}</Text></Text>
                  : <Text type="secondary">—</Text>,
              },
              {
                title: 'Source', dataIndex: 'source', width: 130,
                render: (v) => v ? <Tag color={v === 'CONTRACT' ? 'green' : 'blue'}>{v}</Tag> : <Tag>NO MATCH</Tag>,
              },
              { title: 'Contract', dataIndex: 'contractId', render: (v) => v ?? '—' },
            ]}
          />
        </Card>
      )}
    </PageWrap>
  );
};

export default PriceLookup;
