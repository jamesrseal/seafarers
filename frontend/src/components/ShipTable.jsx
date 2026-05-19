import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useState, useMemo } from 'react';
import { statusColor } from '../utils/statusColors';

const COLUMNS = [
  { accessorKey: 'ship_name',           header: 'Ship Name' },
  {
    accessorKey: 'ship_status',
    header: 'Status',
    cell: ({ getValue }) => {
      const v = getValue() || 'Active';
      const { badge } = statusColor(getValue());
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>{v}</span>;
    },
  },
  { accessorKey: 'flag',                header: 'Flag' },
  { accessorKey: 'port_of_abandonment', header: 'Port' },
  { accessorKey: 'num_seafarers',       header: '# Seafarers' },
  { accessorKey: 'abandonment_date',    header: 'Date' },
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

export default function ShipTable({ ships, onSelect }) {
  const [sorting, setSorting] = useState([{ id: 'abandonment_date', desc: true }]);
  const columns = useMemo(() => COLUMNS, []);

  const table = useReactTable({
    data: ships,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original)}
              className={`cursor-pointer hover:bg-blue-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-3 py-2 border-b border-gray-100 whitespace-nowrap max-w-[200px] truncate">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ships.length === 0 && (
        <div className="text-center py-16 text-gray-400">No records found</div>
      )}
    </div>
  );
}
