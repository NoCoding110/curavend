import React, { useMemo } from 'react';
import { Drawer, Typography, Button } from 'antd';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableColumnRow } from './SortableColumnRow';
import type { ListColumnDef } from '../../hooks/useListColumns';

const { Text } = Typography;

interface Props<K extends string> {
  open: boolean;
  onClose: () => void;
  title?: string;
  allColumns: ListColumnDef<K>[];
  visibleKeys: K[];
  orderedKeys: K[];
  onToggle: (key: K, next: boolean) => void;
  onOrderChange: (next: K[]) => void;
  onReset: () => void;
  onShowAll: () => void;
  /** Keys to hide in the drawer (e.g. context-hidden like "hospital" for hospital users). */
  hiddenKeys?: K[];
}

export function ColumnCustomizerDrawer<K extends string>({
  open,
  onClose,
  title = 'Choose & reorder columns',
  allColumns,
  visibleKeys,
  orderedKeys,
  onToggle,
  onOrderChange,
  onReset,
  onShowAll,
  hiddenKeys = [],
}: Props<K>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const draggableKeys = useMemo(() => {
    const hidden = new Set(hiddenKeys);
    const pinnedKeys = new Set(allColumns.filter((c) => c.pinEnd).map((c) => c.key));
    return orderedKeys.filter((k) => !hidden.has(k) && !pinnedKeys.has(k));
  }, [orderedKeys, hiddenKeys, allColumns]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedKeys.indexOf(active.id as K);
    const newIdx = orderedKeys.indexOf(over.id as K);
    if (oldIdx < 0 || newIdx < 0) return;
    onOrderChange(arrayMove(orderedKeys, oldIdx, newIdx));
  };

  return (
    <Drawer title={title} placement="right" width={360} open={open} onClose={onClose}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Drag rows to reorder. Check boxes to toggle visibility. Your preferences are saved to this browser.
      </Text>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draggableKeys} strategy={verticalListSortingStrategy}>
          {draggableKeys.map((key) => {
            const def = allColumns.find((c) => c.key === key)!;
            return (
              <SortableColumnRow
                key={key}
                id={key}
                label={def.label}
                checked={visibleKeys.includes(key)}
                disabled={def.alwaysVisible}
                onToggle={(next) => onToggle(key, next)}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={onReset}>Reset to Default</Button>
        <Button type="link" onClick={onShowAll}>Show All</Button>
      </div>
    </Drawer>
  );
}

export default ColumnCustomizerDrawer;
