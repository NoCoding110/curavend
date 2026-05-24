/**
 * Admin LCD/NCD ingest page. Lets Curavend admins paste a CSV or JSON file
 * to refresh the coverage criteria library from CMS publications.
 *
 * No clean machine-readable CMS LCD API exists — operators export from the
 * Medicare Coverage Database manually, convert to the template format, and
 * upload here. The /api/lcd/ingest endpoint accepts the structured JSON;
 * /api/lcd/ingest-csv accepts a flat CSV one criterion per row.
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  message,
  Row,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  Alert,
  Statistic,
} from 'antd';
import { UploadOutlined, FileTextOutlined, DownloadOutlined, ReloadOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { get, post } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const CSV_TEMPLATE = `lcd_id,lcd_kind,lcd_title,contractor,jurisdiction,effective_date,source_url,hcpc_code,criterion_type,icd10_codes,required_finding,description,citation,is_mandatory
L33718,LCD,Positive Airway Pressure (PAP) for OSA,CGS,J15,2015-10-01,https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33718,E0601,DIAGNOSIS_REQUIRED,G47.33|G47.30,,Patient must have diagnosis of OSA,LCD L33718 §1.A,1
L33718,LCD,Positive Airway Pressure (PAP) for OSA,CGS,J15,2015-10-01,,E0601,CLINICAL_FINDING,,AHI/RDI >= 15 OR 5-14 with symptoms,Sleep study demonstrates qualifying AHI/RDI,LCD L33718 §1.B,1
L33718,LCD,Positive Airway Pressure (PAP) for OSA,CGS,J15,2015-10-01,,E0601,DOCUMENTATION,,,Face-to-face encounter within 6 months prior,LCD L33718 §1.C,1`;

interface LcdDoc {
  id: string;
  kind: string;
  title: string;
  contractor: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  isActive: number;
  fetchedAt: string;
}

export const LcdIngestPage: React.FC = () => {
  const [docs, setDocs] = useState<LcdDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [csv, setCsv] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  // Scrape modal state
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [scrapeLcdId, setScrapeLcdId] = useState('');
  const [scrapePreview, setScrapePreview] = useState<any | null>(null);
  const [scrapeBusy, setScrapeBusy] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: LcdDoc[] }>('/lcd/documents');
      setDocs(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load LCDs');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetchDocs(); }, []);

  const submitCsv = async () => {
    if (!csv.trim()) return message.warning('Paste CSV text first');
    setBusy(true);
    try {
      const r = await post<{ documents: number; criteria: number; parsedRows: number }>('/lcd/ingest-csv', { csv });
      message.success(`Ingested ${r.documents} LCD(s) with ${r.criteria} criteria (from ${r.parsedRows} CSV rows)`);
      setCsv('');
      void fetchDocs();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const submitJson = async () => {
    if (!json.trim()) return message.warning('Paste JSON first');
    setBusy(true);
    try {
      const parsed = JSON.parse(json);
      const body = Array.isArray(parsed) ? { documents: parsed } : parsed;
      const r = await post<{ documents: number; criteria: number }>('/lcd/ingest', body);
      message.success(`Ingested ${r.documents} LCD(s) with ${r.criteria} criteria`);
      setJson('');
      void fetchDocs();
    } catch (err: any) {
      message.error(err?.message?.startsWith('Unexpected') ? 'Invalid JSON' : err?.response?.data?.error ?? 'Ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const runScrape = async (autoIngest: boolean) => {
    if (!scrapeLcdId.trim()) return message.warning('Enter an LCD ID (e.g. L33718 or 33718)');
    setScrapeBusy(true);
    setScrapePreview(null);
    try {
      const r = await post<{ scraped: any; ingested: any }>('/lcd/fetch-from-cms', {
        lcdId: scrapeLcdId.trim(),
        autoIngest,
      });
      setScrapePreview(r.scraped);
      if (autoIngest) {
        message.success(`Ingested ${r.ingested?.documents ?? 1} LCD with ${r.ingested?.criteria ?? r.scraped?.criteria?.length ?? 0} criteria`);
        void fetchDocs();
      } else {
        message.info(`Scrape preview ready — ${r.scraped?.criteria?.length ?? 0} criteria detected. Click "Ingest" to save.`);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Scrape failed');
    } finally {
      setScrapeBusy(false);
    }
  };

  const downloadCsvTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lcd-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageWrap>
      <Title level={3} style={{ margin: 0 }}>LCD / NCD Coverage Criteria Ingest</Title>
      <Paragraph type="secondary">
        Bulk-import Local Coverage Determinations from CMS Medicare Coverage Database. CMS does not publish
        a machine-readable feed — operators export manually and upload here.
      </Paragraph>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="LCDs in catalog" value={docs.length} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Most recently ingested"
              value={docs[0]?.fetchedAt ? dayjs(docs[0].fetchedAt).format('MMM D, YYYY') : '—'}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Space>
              <Button icon={<CloudDownloadOutlined />} type="primary" onClick={() => { setScrapeOpen(true); setScrapePreview(null); setScrapeLcdId(''); }}>
                Fetch from CMS
              </Button>
              <Button icon={<DownloadOutlined />} onClick={downloadCsvTemplate}>CSV template</Button>
              <Button icon={<ReloadOutlined />} onClick={() => void fetchDocs()}>Refresh</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'csv',
            label: <Space><FileTextOutlined /> CSV upload</Space>,
            children: (
              <>
                <Alert
                  type="info"
                  message="One criterion per row. Group by lcd_id — first occurrence sets LCD metadata; subsequent rows add criteria."
                  description="Required headers: lcd_id, lcd_kind, lcd_title, hcpc_code, criterion_type, description. icd10_codes pipe-separated (e.g. G47.33|G47.30)."
                  style={{ marginBottom: 12 }}
                />
                <Upload
                  beforeUpload={(file) => {
                    const reader = new FileReader();
                    reader.onload = () => setCsv(String(reader.result ?? ''));
                    reader.readAsText(file);
                    return false;
                  }}
                  showUploadList={false}
                  accept=".csv,text/csv"
                  maxCount={1}
                >
                  <Button icon={<UploadOutlined />}>Pick CSV file</Button>
                </Upload>
                <Input.TextArea
                  rows={12}
                  style={{ marginTop: 12, fontFamily: 'monospace', fontSize: 12 }}
                  placeholder="Or paste CSV text here"
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                />
                <Button type="primary" loading={busy} onClick={submitCsv} style={{ marginTop: 12 }}>
                  Ingest CSV
                </Button>
              </>
            ),
          },
          {
            key: 'json',
            label: <Space><FileTextOutlined /> JSON upload</Space>,
            children: (
              <>
                <Alert
                  type="info"
                  message='Structured ingest. Body: {"documents":[{...}]} or just an array of document objects.'
                  description='Each document has id, kind, title, criteria[]. Each criterion has hcpcCode, criterionType, description, icd10Codes[], citation, isMandatory.'
                  style={{ marginBottom: 12 }}
                />
                <Input.TextArea
                  rows={14}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  placeholder='[{"id":"L33718","kind":"LCD","title":"PAP for OSA","criteria":[{"hcpcCode":"E0601","criterionType":"DIAGNOSIS_REQUIRED","description":"...","icd10Codes":["G47.33"]}]}]'
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                />
                <Button type="primary" loading={busy} onClick={submitJson} style={{ marginTop: 12 }}>
                  Ingest JSON
                </Button>
              </>
            ),
          },
        ]}
      />

      <Card size="small" title="LCDs in catalog" style={{ marginTop: 16 }}>
        <Table<LcdDoc>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={docs}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 100 },
            { title: 'Kind', dataIndex: 'kind', width: 80, render: (k) => <Tag>{k}</Tag> },
            { title: 'Title', dataIndex: 'title', ellipsis: true },
            { title: 'Contractor', dataIndex: 'contractor', width: 120 },
            {
              title: 'Effective',
              dataIndex: 'effectiveDate',
              width: 110,
              render: (v: string | null) => (v ? dayjs(v).format('MMM D, YYYY') : '—'),
            },
            {
              title: 'Source',
              dataIndex: 'sourceUrl',
              width: 100,
              render: (v: string | null) => (v ? <a href={v} target="_blank" rel="noreferrer">CMS</a> : '—'),
            },
            {
              title: 'Active',
              dataIndex: 'isActive',
              width: 80,
              render: (v: number) => (v ? <Tag color="green">ACTIVE</Tag> : <Tag>INACTIVE</Tag>),
            },
          ]}
          pagination={{ pageSize: 25 }}
        />
      </Card>
      <Modal
        title="Fetch LCD from CMS Medicare Coverage Database"
        open={scrapeOpen}
        onCancel={() => setScrapeOpen(false)}
        footer={null}
        width={720}
      >
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message="Enter an LCD ID (e.g. L33718 or just 33718). Curavend will fetch the public CMS MCD page, extract HCPC codes / ICD-10 codes / coverage narrative, and structure them as criteria."
          description='Inspect the preview before ingesting. The scraper is best-effort: review for accuracy.'
        />
        <Space style={{ width: '100%' }}>
          <Input
            placeholder="L33718"
            value={scrapeLcdId}
            onChange={(e) => setScrapeLcdId(e.target.value)}
            style={{ width: 200 }}
          />
          <Button loading={scrapeBusy} onClick={() => runScrape(false)}>Preview</Button>
          <Button type="primary" loading={scrapeBusy} onClick={() => runScrape(true)}>Fetch &amp; ingest</Button>
        </Space>
        {scrapePreview && (
          <div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 6 }}>
            <Title level={5}>{scrapePreview.id} — {scrapePreview.title}</Title>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag>{scrapePreview.kind}</Tag>
              {scrapePreview.contractor && <Tag>{scrapePreview.contractor}</Tag>}
              {scrapePreview.effectiveDate && <Tag>Effective {scrapePreview.effectiveDate}</Tag>}
              <Tag color="blue">{scrapePreview.rawHcpcsCount} HCPCs detected</Tag>
              <Tag color="purple">{scrapePreview.rawIcd10Count} ICD-10s detected</Tag>
              <Tag color="green">{scrapePreview.criteria?.length ?? 0} criteria generated</Tag>
            </Space>
            {scrapePreview.summary && (
              <Paragraph style={{ fontSize: 12, color: '#555' }}>{scrapePreview.summary}…</Paragraph>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              Source: <a href={scrapePreview.sourceUrl} target="_blank" rel="noreferrer">{scrapePreview.sourceUrl}</a>
            </Text>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
};

export default LcdIngestPage;
