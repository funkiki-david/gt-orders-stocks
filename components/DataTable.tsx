import type { ReactNode } from 'react';

type Column<T> = {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  activeRowKey?: string;
};

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = 'No records found.',
  rowKey,
  onRowClick,
  activeRowKey,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-header">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`h-10 whitespace-nowrap border-b border-border px-3 font-semibold text-primaryText ${alignClasses[column.align ?? 'left']}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-secondaryText" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const key = rowKey(row, index);
                const clickable = Boolean(onRowClick);
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={`${clickable ? 'cursor-pointer hover:bg-page' : ''} ${activeRowKey === key ? 'bg-page font-semibold' : ''}`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`border-b border-border px-3 py-3 align-middle text-primaryText last:border-b-0 ${alignClasses[column.align ?? 'left']}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
