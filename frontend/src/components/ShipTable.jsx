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

// Returns a YYYYMMDD integer for sorting. Unknown parts are 0.
// Handles "1 April 2009", "August 2004", and "2001".
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
      const { badge } = statusColor(getValue());
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>{statusLabel(getValue())}</span>;
    },
  },
  {
    accessorKey: 'flag',
    header: 'Flag',
    cell: ({ getValue }) => getValue() || <span className="text-gray-400 italic">Unknown</span>,
  },
  { accessorKey: 'port_of_abandonment', header: 'Port' },
  { accessorKey: 'num_seafarers',       header: '# Seafarers' },
  {
    accessorKey: 'abandonment_date',
    header: 'Abandonment Date',
    sortingFn: (a, b, col) => parseDateForSort(a.getValue(col)) - parseDateForSort(b.getValue(col)),
  },
  {
    accessorKey: 'ilo_url',
    header: 'ILO',
    cell: ({ getValue }) => getValue()
      ? <a href={getValue()} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">Link</a>
      : null,
    enableSorting: false,
  },
  {
    accessorKey: 'vessel_finder_url',
    header: 'VesselFinder',
    cell: ({ getValue }) => getValue()
      ? <a href={getValue()} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">Link</a>
      : null,
    enableSorting: false,
  },
];

const PAGE_SIZE = 50;

export default function ShipTable({ ships, onSelect, highlighted }) {
  const [sorting, setSorting] = useState([{ id: 'abandonment_date', desc: true }]);
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

  return (
    <div className="overflow-auto h-full">
      <table className="min-w-full text-sm border-collapse">
        <thead className="bg-gray-100 sticky top-0 z-10">
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(h => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap border-b border-gray-200"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                </th>
              ))}
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
              className={`cursor-pointer hover:bg-blue-50 ${isHighlighted ? 'bg-blue-100 font-medium' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-3 py-2 border-b border-gray-100 whitespace-nowrap max-w-[200px] truncate">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
      {ships.length === 0 && (
        <div className="text-center py-16 text-gray-400">No records found</div>
      )}
      {ships.length > PAGE_SIZE && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
          <span>
            {table.getState().pagination.pageIndex * PAGE_SIZE + 1}–
            {Math.min((table.getState().pagination.pageIndex + 1) * PAGE_SIZE, ships.length)} of {ships.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Prev
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
