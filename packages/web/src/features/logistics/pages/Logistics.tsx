/**
 * Logistics — shipment tracking with ETA + cold-chain temp.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Empty, Row, Space, Statistic, Table, Tag, Typography, message, InputNumber,
} from 'antd';
import {
  ReloadOutlined, RocketOutlined, FireOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface Shipment {
  id: string;
  orderId: string;
  carrierCode: string | null;
  trackingNumber: string | null;
  shipmentDate: string | null;
  actualDeliveryDate: string | null;
  etaAt: string | null;
  coldChainRequired: number;
  lastTempC: number | null;
  lastTempAt: string | null;
  hadExcursion: number;
  latestStatus: string | null;
  podAttachment: string | null;
}
interface TempReading {
  id: string;
  readingAt: string;
  temperatureC: number;
  humidityPct: number | null;
  isExcursion: number;
  source: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  IN_TRANSIT: 'blue', OUT_FOR_DELIVERY: 'cyan', DELIVERED: 'green', EXCEPTION: 'red', RETURNED: 'orange',
};

const LogisticsPage: React.FC = () => {
  const [rows, setRows] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<(Shipment & { tempReadings?: TempReading[] }) | null>(null);
  const [tempInput, setTempInput] = useState<number>();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Shipment[] }>('/logistics/shipments');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openDetail = async (id: string) => {
    const r = await get<any>(`/logistics/shipments/${id}`);
    setDetail(r);
  };

  const submitTemp = async () => {
    if (!detail || tempInput == null) return;
    try {
      await post(`/logistics/shipments/${detail.id}/temp`, { temperatureC: tempInput, source: 'MANUAL' });
      message.success('Reading recorded');
      setTempInput(undefined);
      await openDetail(detail.id);
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const inTransit = rows.filter((r) => !r.actualDeliveryDate).length;
  const excursions = rows.filter((r) => r.hadExcursion === 1).length;
  const coldChain = rows.filter((r) => r.coldChainRequired === 1).length;

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><RocketOutlined /> Logistics & Cold Chain</Space>
          </Title>
          <Text type="secondary">Shipment ETAs, last temperature, excursion flags.</Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button></Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={8}><Card size="small"><Statistic title="In transit" value={inTransit} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Cold-chain" value={coldChain} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Excursions" value={excursions} valueStyle={{ color: excursions > 0 ? '#cf1322' : undefined }} /></Card></Col>
      </Row>

      <Card size="small">
        <Table<Shipment>
          rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Tracking', dataIndex: 'trackingNumber', render: (v, r) => <a onClick={() => openDetail(r.id)}>{v ?? r.id.slice(0, 8)}</a> },
            { title: 'Carrier', dataIndex: 'carrierCode', width: 110, render: (v) => v ? <Tag>{v}</Tag> : '—' },
            { title: 'Status', dataIndex: 'latestStatus', width: 140, render: (v) => v ? <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag> : '—' },
            { title: 'Shipped', dataIndex: 'shipmentDate', width: 130, render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
            { title: 'ETA', dataIndex: 'etaAt', width: 160, render: (v) => v ? new Date(v).toLocaleString() : '—' },
            {
              title: 'Cold chain', dataIndex: 'coldChainRequired', width: 110,
              render: (v, r) => {
                if (!v) return <Text type="secondary">—</Text>;
                if (r.hadExcursion) return <Space><FireOutlined style={{ color: '#cf1322' }} /><Tag color="red">EXCURSION</Tag></Space>;
                return <Tag color="blue">OK</Tag>;
              },
            },
            {
              title: 'Last temp', width: 130,
              render: (_, r) => r.lastTempC != null ? (
                <Space direction="vertical" size={0}>
                  <strong>{r.lastTempC.toFixed(1)}°C</strong>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.lastTempAt ? new Date(r.lastTempAt).toLocaleString() : ''}
                  </Text>
                </Space>
              ) : <Text type="secondary">—</Text>,
            },
            {
              title: 'POD', dataIndex: 'podAttachment', width: 70,
              render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">view</a> : '—',
            },
          ]}
        />
      </Card>

      <Drawer title={detail?.trackingNumber ?? 'Shipment'} width={620} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            {detail.hadExcursion === 1 && (
              <Alert type="error" showIcon icon={<FireOutlined />} style={{ marginBottom: 12 }}
                message="Cold-chain excursion detected on at least one reading." />
            )}
            <Card size="small" title="Quick temp reading" style={{ marginBottom: 12 }}>
              <Space>
                <InputNumber addonAfter="°C" value={tempInput} onChange={(v) => setTempInput(Number(v))} />
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={submitTemp}>Record</Button>
              </Space>
            </Card>
            <Title level={5}>Recent readings ({detail.tempReadings?.length ?? 0})</Title>
            {(!detail.tempReadings || detail.tempReadings.length === 0) ? (
              <Empty description="No readings yet" />
            ) : (
              <Table
                size="small" rowKey="id" pagination={false}
                dataSource={detail.tempReadings}
                columns={[
                  { title: 'When', dataIndex: 'readingAt', width: 170, render: (v) => new Date(v).toLocaleString() },
                  { title: 'Temp', dataIndex: 'temperatureC', width: 90, render: (v) => `${v.toFixed(1)}°C` },
                  { title: 'Hum', dataIndex: 'humidityPct', width: 80, render: (v) => v != null ? `${v}%` : '—' },
                  { title: 'Source', dataIndex: 'source', width: 120, render: (v) => v ? <Tag>{v}</Tag> : '—' },
                  { title: 'Excursion', dataIndex: 'isExcursion', width: 100, render: (v) => v ? <Tag color="red">YES</Tag> : '—' },
                ]}
              />
            )}
          </>
        )}
      </Drawer>
    </PageWrap>
  );
};

export default LogisticsPage;
