/**
 * useResizableColumns
 *
 * Drop-in hook that makes any Ant Design Table's columns drag-resizable.
 *
 * Usage:
 *   const { columns, components } = useResizableColumns(rawColumns);
 *   <Table columns={columns} components={components} ... />
 *
 * - Pass an array of AntD ColumnType objects (with an optional `width` for the
 *   initial size; columns without a width default to 150px).
 * - The hook returns a new `columns` array with updated widths and a
 *   `components` object that wires the resizable header cell.
 * - Widths are kept in local component state — they reset on page navigation,
 *   which is intentional (no stale persisted layouts).
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Resizable } from 'react-resizable';
import type { ResizeCallbackData } from 'react-resizable';
import type { ColumnType } from 'antd/es/table';
import 'react-resizable/css/styles.css';

// Minimum and maximum column widths (px)
const MIN_WIDTH = 60;
const MAX_WIDTH = 800;

// ── Resizable header cell ──────────────────────────────────────────────────

interface ResizableTitleProps extends React.HTMLAttributes<HTMLElement> {
  width?: number;
  onResize?: (e: React.SyntheticEvent, data: ResizeCallbackData) => void;
  [key: string]: any;
}

const ResizableTitle: React.FC<ResizableTitleProps> = ({
  onResize,
  width,
  ...restProps
}) => {
  const isDragging = useRef(false);

  if (!width || !onResize) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            top: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 1,
          }}
          onClick={(e) => {
            // Prevent click from bubbling to sort handler while/after dragging
            if (isDragging.current) {
              e.stopPropagation();
              isDragging.current = false;
            }
          }}
        />
      }
      onResizeStart={() => {
        isDragging.current = true;
      }}
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th
        {...restProps}
        style={{
          ...restProps.style,
          position: 'relative',
          userSelect: 'none',
        }}
      />
    </Resizable>
  );
};

// ── Hook ───────────────────────────────────────────────────────────────────

type AnyColumn = ColumnType<any> & { [key: string]: any };

/**
 * @param rawColumns  The column definitions you would normally pass to <Table>.
 * @returns           `{ columns, components }` — spread both onto <Table>.
 */
export function useResizableColumns(rawColumns: AnyColumn[]) {
  // Initialise widths from the column definitions (fall back to 150)
  const [widths, setWidths] = useState<number[]>(() =>
    rawColumns.map((c) => (typeof c.width === 'number' ? c.width : 150)),
  );

  // Keep widths array in sync when rawColumns length changes (e.g. role-gated)
  const prevLen = useRef(rawColumns.length);
  if (rawColumns.length !== prevLen.current) {
    prevLen.current = rawColumns.length;
    setWidths(rawColumns.map((c) => (typeof c.width === 'number' ? c.width : 150)));
  }

  const handleResize = useCallback(
    (index: number) =>
      (_e: React.SyntheticEvent, { size }: ResizeCallbackData) => {
        setWidths((prev) => {
          const next = [...prev];
          next[index] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, size.width));
          return next;
        });
      },
    [],
  );

  const columns: AnyColumn[] = useMemo(
    () =>
      rawColumns.map((col, i) => ({
        ...col,
        width: widths[i],
        onHeaderCell: (column: any) => ({
          width: widths[i],
          onResize: handleResize(i),
          ...(col.onHeaderCell ? col.onHeaderCell(column) : {}),
        }),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawColumns, widths, handleResize],
  );

  const components = useMemo(
    () => ({
      header: {
        cell: ResizableTitle,
      },
    }),
    [],
  );

  return { columns, components };
}
