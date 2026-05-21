import React, { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  Empty,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BookOutlined,
  SaveOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
  DeleteOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import type { FilterPreset } from '../../api/filterPresets';
import type { UseFilterPresetsResult } from '../../hooks/useFilterPresets';

const { Text } = Typography;
const BRAND_COLOR = '#1BAEE5';

interface Props {
  controller: UseFilterPresetsResult;
  /** Build the filter snapshot to save when the user clicks "Save current as…". */
  getCurrentFilters: () => Record<string, any>;
  /** Apply a preset's filters to the page (caller owns state). */
  onApply: (preset: FilterPreset) => void;
  /** Optional: describe what's being saved (shown below the name field). */
  hint?: string;
  /** Optional button label override. */
  buttonLabel?: string;
}

export const FilterPresetsMenu: React.FC<Props> = ({
  controller,
  getCurrentFilters,
  onApply,
  hint,
  buttonLabel = 'Presets',
}) => {
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [form] = Form.useForm();
  const { presets, activePresetId } = controller;

  const items = useMemo<MenuProps['items']>(() => {
    const list: NonNullable<MenuProps['items']> = [];
    if (presets.length === 0) {
      list.push({
        key: 'empty',
        label: <Text type="secondary">No saved presets</Text>,
        disabled: true,
      });
    } else {
      presets.forEach((p) => {
        list.push({
          key: p.id,
          label: (
            <Space>
              {p.isDefault && <StarFilled style={{ color: '#faad14' }} />}
              {activePresetId === p.id && <CheckOutlined style={{ color: BRAND_COLOR }} />}
              <span>{p.name}</span>
            </Space>
          ),
          onClick: () => onApply(p),
        });
      });
    }
    list.push({ type: 'divider' });
    list.push({
      key: 'save',
      icon: <SaveOutlined />,
      label: 'Save current as…',
      onClick: () => {
        form.resetFields();
        setSaveOpen(true);
      },
    });
    if (presets.length > 0) {
      list.push({
        key: 'manage',
        icon: <SettingOutlined />,
        label: 'Manage presets…',
        onClick: () => setManageOpen(true),
      });
    }
    return list;
  }, [presets, activePresetId, form, onApply]);

  const handleSave = async (values: { name: string; isDefault?: boolean }) => {
    try {
      const preset = await controller.saveAs(
        values.name,
        getCurrentFilters(),
        !!values.isDefault,
      );
      setSaveOpen(false);
      form.resetFields();
      message.success(`Preset "${preset.name}" saved`);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to save preset');
    }
  };

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']}>
        <Button icon={<BookOutlined />}>
          {buttonLabel}{activePresetId && ' •'}
        </Button>
      </Dropdown>

      <Modal
        title="Save Filter Preset"
        open={saveOpen}
        onOk={() => form.submit()}
        onCancel={() => setSaveOpen(false)}
        okText="Save"
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="name"
            label="Preset Name"
            rules={[{ required: true, message: 'Please enter a name' }, { max: 100 }]}
          >
            <Input placeholder="e.g. My Active Items" />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked">
            <label>
              <input
                type="checkbox"
                onChange={(e) => form.setFieldValue('isDefault', e.target.checked)}
              />{' '}
              Apply automatically when I open this page
            </label>
          </Form.Item>
          {hint && (
            <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>
          )}
        </Form>
      </Modal>

      <Modal
        title="Manage Presets"
        open={manageOpen}
        onCancel={() => setManageOpen(false)}
        footer={<Button onClick={() => setManageOpen(false)}>Close</Button>}
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
                      icon={
                        p.isDefault
                          ? <StarFilled style={{ color: '#faad14' }} />
                          : <StarOutlined />
                      }
                      onClick={async () => {
                        try {
                          await controller.toggleDefault(p);
                          message.success(p.isDefault ? 'Default cleared' : 'Set as default');
                        } catch (e: any) {
                          message.error(e?.response?.data?.error || 'Failed to update preset');
                        }
                      }}
                    />
                  </Tooltip>,
                  <Button
                    key="apply"
                    type="link"
                    onClick={() => {
                      onApply(p);
                      setManageOpen(false);
                    }}
                  >
                    Apply
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title="Delete this preset?"
                    onConfirm={async () => {
                      try {
                        await controller.remove(p.id);
                        message.success('Preset deleted');
                      } catch (e: any) {
                        message.error(e?.response?.data?.error || 'Failed to delete preset');
                      }
                    }}
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
    </>
  );
};

export default FilterPresetsMenu;
