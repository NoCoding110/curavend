import React from 'react';
import { Checkbox, Typography } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Text } = Typography;

interface Props {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}

export const SortableColumnRow: React.FC<Props> = ({ id, label, checked, disabled, onToggle }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    marginBottom: 6,
    background: isDragging ? '#e6f7ff' : '#fafafa',
    border: '1px solid #f0f0f0',
    borderRadius: 6,
    opacity: isDragging ? 0.85 : 1,
    userSelect: 'none',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: '#8c8c8c', display: 'flex', alignItems: 'center' }}
        title="Drag to reorder"
      >
        <HolderOutlined />
      </span>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
      >
        <Text>{label}</Text>
      </Checkbox>
    </div>
  );
};

export default SortableColumnRow;
