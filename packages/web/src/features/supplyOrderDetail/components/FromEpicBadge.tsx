/**
 * FromEpicBadge — small inline tag that marks a wizard field as sourced from
 * Epic FHIR and (typically) locked. Wraps its `children` with a tooltip that
 * explains why the field can't be edited.
 */
import React from 'react';
import { Tag, Tooltip, Space } from 'antd';
import { ApiOutlined } from '@ant-design/icons';

interface Props {
  /** Override the default tooltip. */
  tooltip?: string;
  /** Style the badge dense (no margin) when it lives inside a Form.Item label. */
  inline?: boolean;
}

const DEFAULT_TOOLTIP =
  'This field is sourced from Epic FHIR and locked. To change it, update the value in the Epic chart and re-launch.';

const FromEpicBadge: React.FC<Props> = ({ tooltip, inline = false }) => {
  const content = (
    <Tag
      color="purple"
      icon={<ApiOutlined />}
      style={{ marginInlineEnd: inline ? 0 : 4, cursor: 'help' }}
    >
      From Epic
    </Tag>
  );
  return (
    <Tooltip title={tooltip ?? DEFAULT_TOOLTIP}>
      <Space size={4}>{content}</Space>
    </Tooltip>
  );
};

export default FromEpicBadge;
