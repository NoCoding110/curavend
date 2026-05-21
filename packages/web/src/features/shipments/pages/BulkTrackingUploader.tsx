/**
 * Bulk tracking CSV uploader — paste CSV or upload a file; dry-run validates
 * every row before commit; per-row error reporting.
 *
 * Expected CSV columns:
 *   orderIdentifier, carrierCode, trackingNumber, [shipmentDate], [expectedDeliveryDate], [carrierServiceLevel]
 */
import React, { useState } from 'react';
import {
  Card,
  Typography,
  Upload,
  Button,
  Input,
  Table,
  Tag,
  Space,
  Alert,
  message,
  Divider,
  Statistic,
  Row,
  Col,
} from 'antd';
import { InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import styled from 'styled-components';
import { shipmentsApi, type BulkTrackingItem, type BulkTrackingResponse } from '../../../api/shipments';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const PageWrap = styled.div`padding: 24px;`;

function parseCsv(text: string): { rows: BulkTrackingItem[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ['CSV is empty'] };
  const headerRaw = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (k: string) => headerRaw.indexOf(k);
  const iOrderIdent = idx('orderidentifier');
  const iCarrier = idx('carriercode');
  const iTracking = idx('trackingnumber');
  const iShipDate = idx('shipmentdate');
  const iExpDate = idx('expecteddeliverydate');
  const iService = idx('carrierservicelevel');
  const errors: string[] = [];
  if (iOrderIdent < 0) errors.push('Missing required column: orderIdentifier');
  if (iCarrier < 0) errors.push('Missing required column: carrierCode');
  if (iTracking < 0) errors.push('Missing required column: trackingNumber');
  if (errors.length) return { rows: [], errors };

  const rows: BulkTrackingItem[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(',').map((c) => c.trim());
    if (cols.every((c) => c.length === 0)) continue;
    rows.push({
      orderIdentifier: cols[iOrderIdent] ?? '',
      carrierCode: (cols[iCarrier] ?? null) as any,
      trackingNumber: cols[iTracking] ?? '',
      shipmentDate: iShipDate >= 0 ? cols[iShipDate] : undefined,
      expectedDeliveryDate: iExpDate >= 0 ? cols[iExpDate] : undefined,
      carrierServiceLevel: iService >= 0 ? cols[iService] : undefined,
    });
  }
  return { rows, errors: [] };
}

const BulkTrackingUploader: React.FC = () => {
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<BulkTrackingItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<BulkTrackingResponse | null>(null);

  const draggerProps: UploadProps = {
    multiple: false,
    accept: '.csv,text/csv',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? '');
        setCsvText(text);
        const r = parseCsv(text);
        setParsed(r.rows);
        setParseErrors(r.errors);
      };
      reader.readAsText(file);
      return false;
    },
  };

  const handleParse = () => {
    const r = parseCsv(csvText);
    setParsed(r.rows);
    setParseErrors(r.errors);
    setResponse(null);
  };

  const submit = async (dryRun: boolean) => {
    if (parsed.length === 0) {
      message.warning('Parse the CSV first');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await shipmentsApi.bulkTracking({
        items: parsed,
        dryRun,
        idempotencyKey: dryRun ? undefined : `csv-${Date.now()}`,
      });
      setResponse(resp);
      if (dryRun) {
        message.info(`Dry run: ${resp.succeeded} ok / ${resp.failed} failed`);
      } else if (resp.failed === 0) {
        message.success(`Tracking applied to ${resp.succeeded} orders`);
      } else {
        message.warning(`Applied ${resp.succeeded}, ${resp.failed} failed — see per-row errors`);
      }
    } catch (err: any) {
      message.error(`Bulk submit failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Bulk Tracking Upload</Title>
        <Text type="secondary">
          Paste a CSV (or drop a file) with columns: <code>orderIdentifier, carrierCode, trackingNumber, shipmentDate, expectedDeliveryDate, carrierServiceLevel</code>.
          Dry-run before committing.
        </Text>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Dragger {...draggerProps} style={{ marginBottom: 12 }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>Click or drag a CSV file</p>
        </Dragger>
        <Text type="secondary" style={{ fontSize: 12 }}>…or paste CSV below:</Text>
        <Input.TextArea
          rows={6}
          placeholder={'orderIdentifier,carrierCode,trackingNumber,shipmentDate\nBGH-2026-000001,FEDEX,FX-001,2026-05-15'}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          style={{ marginTop: 4 }}
        />
        <Space style={{ marginTop: 12 }}>
          <Button onClick={handleParse}>Parse CSV</Button>
          <Button icon={<ExperimentOutlined />} onClick={() => submit(true)} loading={submitting} disabled={parsed.length === 0}>Dry run</Button>
          <Button type="primary" onClick={() => submit(false)} loading={submitting} disabled={parsed.length === 0}>Commit</Button>
        </Space>
      </Card>

      {parseErrors.length > 0 && (
        <Alert type="error" message="CSV parse error" description={parseErrors.join('; ')} style={{ marginBottom: 16 }} />
      )}

      {parsed.length > 0 && (
        <Card title={`Parsed ${parsed.length} row(s)`} style={{ marginBottom: 16 }}>
          <Table
            size="small"
            dataSource={parsed.map((r, i) => ({ ...r, key: i }))}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'Order #', dataIndex: 'orderIdentifier', width: 180 },
              { title: 'Carrier', dataIndex: 'carrierCode', width: 100 },
              { title: 'Tracking', dataIndex: 'trackingNumber' },
              { title: 'Ship date', dataIndex: 'shipmentDate', width: 110 },
              { title: 'Expected', dataIndex: 'expectedDeliveryDate', width: 110 },
              { title: 'Service', dataIndex: 'carrierServiceLevel', width: 100 },
            ]}
          />
        </Card>
      )}

      {response && (
        <Card title={response.dryRun ? 'Dry-run results' : 'Commit results'}>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={6}><Statistic title="Succeeded" value={response.succeeded} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Col>
            <Col span={6}><Statistic title="Failed" value={response.failed} prefix={<CloseCircleOutlined />} valueStyle={{ color: '#f5222d' }} /></Col>
          </Row>
          <Divider />
          <Table
            size="small"
            dataSource={response.results.map((r, i) => ({ ...r, key: i }))}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'Order #', dataIndex: 'orderIdentifier', width: 200 },
              {
                title: 'Status', dataIndex: 'status', width: 100,
                render: (s) => <Tag color={s === 'OK' ? 'green' : 'red'}>{s}</Tag>,
              },
              { title: 'Error', dataIndex: 'error', render: (v) => v ?? '—' },
            ]}
          />
        </Card>
      )}
    </PageWrap>
  );
};

export default BulkTrackingUploader;
