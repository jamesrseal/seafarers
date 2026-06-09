import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useState, useMemo, useEffect } from 'react';
import { statusColor, statusLabel } from '../utils/statusColors';

const MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};

function parseDateForSort(str) {
  if (!str) return 0;
  const parts = str.trim().split(/\s+/);
  if (parts.length === 1) return parseInt(parts[0], 10) * 10000;
  if (parts.length === 2) {
    const month = MONTHS[parts[0].toLowerCase()] ?? 0;
    return parseInt(parts[1], 10) * 10000 + month * 100;
  }
  const day   = parseInt(parts[0], 10);
  const month = MONTHS[parts[1].toLowerCase()] ?? 0;
  const year  = parseInt(parts[2], 10);
  return year * 10000 + month * 100 + day;
}

const COLUMNS = [
  { accessorKey: 'ship_name',           header: 'Ship Name' },
  {
    accessorKey: 'ship_status',
    header: 'Status',
    cell: ({ getValue }) => {
      const { badge, definition } = statusColor(getValue());
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${badge}`} title={definition}>{statusLabel(getValue())}</span>;
    },
  },
  {
    accessorKey: 'flag',
    header: 'Flag',
    cell: ({ getValue }) => getValue() || <span className="text-gray-400 italic">Unknown</span>,
  },
  { accessorKey: 'port_of_abandonment', header: 'Port' },
  { accessorKey: 'num_seafarers',       header: 'Seafarers' },
  {
    accessorKey: 'abandonment_date',
    header: 'Abandonment Date',
    sortingFn: (a, b, col) => parseDateForSort(a.getValue(col)) - parseDateForSort(b.getValue(col)),
  },
  {
    accessorKey: 'last_activity_date',
    header: 'Last Activity',
    sortingFn: (a, b, col) => {
      const av = a.getValue(col) ?? '';
      const bv = b.getValue(col) ?? '';
      return av < bv ? -1 : av > bv ? 1 : 0;
    },
    cell: ({ getValue }) => getValue() ?? <span className="text-gray-400">—</span>,
  },
  {
    id: 'links',
    header: 'Links',
    enableSorting: false,
    cell: ({ row }) => {
      const { ilo_url, vessel_finder_url } = row.original;
      if (!ilo_url && !vessel_finder_url) return null;
      return (
        <div className="flex gap-2">
          {ilo_url && (
            <a href={ilo_url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-blue-600 hover:underline">
              ILO
            </a>
          )}
          {vessel_finder_url && (
            <a href={vessel_finder_url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-blue-600 hover:underline">
              VesselFinder
            </a>
          )}
        </div>
      );
    },
  },
];

const PAGE_SIZE = 50;

function SortIcon({ column }) {
  if (!column.getCanSort()) return null;
  const sorted = column.getIsSorted();
  return (
    <span className={`ml-1 text-[10px] ${sorted ? 'text-blue-600' : 'text-gray-400'}`}>
      {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
    </span>
  );
}

export default function ShipTable({ ships, onSelect, highlighted }) {
  const [sorting, setSorting] = useState([{ id: 'last_activity_date', desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
  const columns = useMemo(() => COLUMNS, []);
  useEffect(() => { setPagination(p => ({ ...p, pageIndex: 0 })); }, [ships]);

  const table = useReactTable({
    data: ships,
    columns,
    state: { sorting, pagination },
    onSortingChange: (updater) => { setSorting(updater); setPagination(p => ({ ...p, pageIndex: 0 })); },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-auto flex-1">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-gray-100 sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => {
                  const canSort = h.column.getCanSort();
                  const isSorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      className={`text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide select-none whitespace-nowrap border-b border-gray-200 ${
                        canSort ? 'cursor-pointer hover:bg-gray-200' : 'cursor-default'
                      } ${isSorted ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <SortIcon column={h.column} />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => {
              const isHighlighted = highlighted?.abandonment_id === row.original.abandonment_id;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(isHighlighted ? null : row.original)}
                  className={`cursor-pointer hover:bg-blue-50 ${
                    isHighlighted ? 'bg-blue-100 font-medium' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  {row.getVisibleCells().map(cell => {
                    const raw = cell.getValue();
                    const title = typeof raw === 'string' ? raw : undefined;
                    return (
                      <td
                        key={cell.id}
                        title={title}
                        className="px-3 py-2 border-b border-gray-100 whitespace-nowrap max-w-[200px] truncate"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {ships.length === 0 && (
          <div className="text-center py-16 text-gray-400">No records found</div>
        )}
      </div>

      {/* Pagination — always visible */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
        <span className="text-gray-500">
          {ships.length === 0
            ? 'No records'
            : `${pageIndex * PAGE_SIZE + 1}–${Math.min((pageIndex + 1) * PAGE_SIZE, ships.length)} of ${ships.length}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-default"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-400">
            Page {pageIndex + 1} of {Math.max(pageCount, 1)}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-default"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
