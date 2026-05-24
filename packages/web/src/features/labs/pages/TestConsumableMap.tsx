/**
 * Test → consumable usage map editor.
 *
 * Two-pane:
 *   - LEFT: list of test codes (deduped from existing mappings), with row counts
 *   - RIGHT: detail editor for the selected test — per-consumable quantity grid
 *
 * Powers the lab forecasting engine: when a `lab_orders` row is run, the
 * mapped consumables × quantityPerTest contribute to projected demand.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { labInventoryApi, type LabConsumable } from '../../../api/labInventory';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;
const TestCard = styled(Card)<{ $active?: boolean }>`
  margin-bottom: 8px;
  cursor: pointer;
  border-color: ${(p) => (p.$active ? '#1BAEE5' : undefined)};
  background: ${(p) => (p.$active ? '#E6F7FF' : undefined)};
  &:hover { border-color: #1BAEE5; }
`;

interface MapRow {
  id: string;
  labGroupId: string | null;
  testCode: string;
  testDescription: string | null;
  consumableId: string;
  quantityPerTest: number;
  isCritical: number;
  notes: string | null;
}

interface TestGroup {
  testCode: string;
  testDescription: string;
  rowCount: number;
  hasCritical: boolean;
}

export const TestConsumableMapPage: React.FC = () => {
  const [rows, setRows] = useState<MapRow[]>([]);
  const [consumables, setConsumables] = useState<LabConsumable[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [newTestForm] = Form.useForm();

  const reload = async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        labInventoryApi.listTestMap(),
        labInventoryApi.listConsumables({ isActive: '1' }),
      ]);
      const items = (m.items as MapRow[]) ?? [];
      setRows(items);
      setConsumables(c.items ?? []);
      if (!selectedTest && items.length) {
        setSelectedTest(items[0].testCode);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Group by test code
  const testGroups = useMemo<TestGroup[]>(() => {
    const map = new Map<string, TestGroup>();
    for (const r of rows) {
      const g = map.get(r.testCode) ?? {
        testCode: r.testCode,
        testDescription: r.testDescription ?? r.testCode,
        rowCount: 0,
        hasCritical: false,
      };
      g.rowCount++;
      if (r.isCritical) g.hasCritical = true;
      // Use first non-null description we see
      if (!g.testDescription || g.testDescription === r.testCode) {
        if (r.testDescription) g.testDescription = r.testDescription;
      }
      map.set(r.testCode, g);
    }
    return Array.from(map.values()).sort((a, b) => a.testCode.localeCompare(b.testCode));
  }, [rows]);

  const selectedRows = useMemo(
    () => rows.filter((r) => r.testCode === selectedTest),
    [rows, selectedTest],
  );

  const consumableMap = useMemo(
    () => new Map(consumables.map((c) => [c.id, c])),
    [consumables],
  );

  // ── Add a consumable to current test ────────────────────────────────────
  const openAdd = () => {
    if (!selectedTest) {
      message.warning('Select a test first');
      return;
    }
    addForm.resetFields();
    addForm.setFieldsValue({
      testCode: selectedTest,
      testDescription: testGroups.find((g) => g.testCode === selectedTest)?.testDescription,
      quantityPerTest: 1,
      isCritical: false,
    });
    setAddOpen(true);
  };
  const submitAdd = async () => {
    try {
      const v = await addForm.validateFields();
      await labInventoryApi.createTestMap({
        testCode: v.testCode,
        testDescription: v.testDescription,
        consumableId: v.consumableId,
        quantityPerTest: Number(v.quantityPerTest),
        isCritical: !!v.isCritical,
        notes: v.notes,
      });
      message.success('Mapping added');
      setAddOpen(false);
      void reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  // ── Remove a consumable from a test ────────────────────────────────────
  const removeRow = async (id: string) => {
    try {
      await labInventoryApi.removeTestMap(id);
      message.success('Mapping removed');
      void reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  // ── Create a new test (just opens add modal with blank test code) ──────
  const openNewTest = () => {
    newTestForm.resetFields();
    setNewTestOpen(true);
  };
  const submitNewTest = async () => {
    try {
      const v = await newTestForm.validateFields();
      // Just select it; user fills first mapping next
      setSelectedTest(v.testCode);
      setNewTestOpen(false);
      // Pre-open add so the user can add the first consumable immediately
      setTimeout(() => {
        addForm.resetFields();
        addForm.setFieldsValue({
          testCode: v.testCode,
          testDescription: v.testDescription,
          quantityPerTest: 1,
          isCritical: false,
        });
        setAddOpen(true);
      }, 200);
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Test → Consumable Map</Title>
          <Text type="secondary">
            Recipe of what each lab test consumes. Powers usage-based forecasting and auto-replenishment.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>Refresh</Button>
            <Button icon={<PlusOutlined />} onClick={openNewTest}>Add test</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* Tests pane */}
        <Col xs={24} md={6}>
          <Card title={<Space>Tests <Tag>{testGroups.length}</Tag></Space>} size="small">
            {testGroups.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tests mapped" />
            ) : (
              testGroups.map((g) => (
                <TestCard
                  key={g.testCode}
                  size="small"
                  $active={selectedTest === g.testCode}
                  onClick={() => setSelectedTest(g.testCode)}
                >
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <strong>{g.testCode}</strong>
                    <Text type="secondary" style={{ fontSize: 12 }}>{g.testDescription}</Text>
                    <Space size={4} style={{ marginTop: 4 }}>
                      <Tag>{g.rowCount} item{g.rowCount !== 1 ? 's' : ''}</Tag>
                      {g.hasCritical && <Tag color="red">CRITICAL</Tag>}
                    </Space>
                  </Space>
                </TestCard>
              ))
            )}
          </Card>
        </Col>

        {/* Detail pane */}
        <Col xs={24} md={18}>
          <Card
            size="small"
            title={
              <Space>
                <ExperimentOutlined style={{ color: '#1BAEE5' }} />
                <span>{selectedTest ? `Recipe — ${selectedTest}` : 'Pick a test'}</span>
                {selectedTest && <Tag>{selectedRows.length} items</Tag>}
              </Space>
            }
            extra={selectedTest && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAdd}>
                Add consumable
              </Button>
            )}
          >
            {!selectedTest ? (
              <Empty description="Select a test from the left to view its recipe" />
            ) : (
              <>
                <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                  Each row says how much of each consumable this test consumes. Mark CRITICAL items
                  to flag when stock-out would block the test from running.
                </Paragraph>
                <Table<MapRow>
                  size="small"
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  dataSource={selectedRows}
                  columns={[
                    {
                      title: 'Consumable',
                      dataIndex: 'consumableId',
                      render: (cid: string) => {
                        const c = consumableMap.get(cid);
                        return c ? (
                          <Space direction="vertical" size={0}>
                            <strong>{c.itemCode}</strong>
                            <Text type="secondary" style={{ fontSize: 12 }}>{c.description}</Text>
                          </Space>
                        ) : <Text type="secondary">[deleted item]</Text>;
                      },
                    },
                    {
                      title: 'Category',
                      dataIndex: 'consumableId',
                      width: 110,
                      render: (cid: string) => {
                        const c = consumableMap.get(cid);
                        return c ? <Tag>{c.category}</Tag> : null;
                      },
                    },
                    {
                      title: 'Qty / test',
                      dataIndex: 'quantityPerTest',
                      width: 110,
                      render: (q: number, r: MapRow) => {
                        const c = consumableMap.get(r.consumableId);
                        return (
                          <span>
                            <strong>{q}</strong>{' '}
                            <Text type="secondary">{c?.usageUom ?? 'each'}</Text>
                          </span>
                        );
                      },
                    },
                    {
                      title: 'Critical',
                      dataIndex: 'isCritical',
                      width: 90,
                      render: (v: number) =>
                        v ? <Tag color="red" icon={<WarningOutlined />}>Critical</Tag> : <Text type="secondary">—</Text>,
                    },
                    { title: 'Notes', dataIndex: 'notes', ellipsis: true },
                    {
                      title: '',
                      width: 50,
                      render: (_, r) => (
                        <Popconfirm title="Remove this mapping?" onConfirm={() => removeRow(r.id)}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* Add mapping modal */}
      <Modal title="Add consumable to recipe" open={addOpen} onCancel={() => setAddOpen(false)} onOk={submitAdd} okText="Add">
        <Form form={addForm} layout="vertical">
          <Row gutter={12}>
            <Col span={8}><Form.Item name="testCode" label="Test code" rules={[{ required: true }]}><Input disabled={!!selectedTest} /></Form.Item></Col>
            <Col span={16}><Form.Item name="testDescription" label="Test description"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="consumableId" label="Consumable" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Pick from catalog"
              options={consumables.map((c) => ({ value: c.id, label: `${c.itemCode} — ${c.description} (${c.category})` }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="quantityPerTest" label="Qty per test" rules={[{ required: true }]}><InputNumber min={0} step={0.001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="isCritical" valuePropName="checked" label="Critical (blocks test if out of stock)"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* New test modal */}
      <Modal title="Add new test" open={newTestOpen} onCancel={() => setNewTestOpen(false)} onOk={submitNewTest} okText="Next: add consumables">
        <Form form={newTestForm} layout="vertical">
          <Form.Item name="testCode" label="Test code (CPT, LOINC, or internal)" rules={[{ required: true }]}>
            <Input placeholder="e.g. 87502" />
          </Form.Item>
          <Form.Item name="testDescription" label="Description">
            <Input placeholder="e.g. Influenza A/B by NAAT" />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrap>
  );
};

export default TestConsumableMapPage;
