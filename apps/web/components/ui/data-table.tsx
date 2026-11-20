"use client";
import { isValidElement, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search, X, Table2 } from "lucide-react";
import { Select } from "./select";

function cellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(cellText).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return cellText(node.props.children);
  return String(node);
}
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  const [query, setQuery] = useState(""), [page, setPage] = useState(1), [size, setSize] = useState(10);
  const filtered = query.trim() ? rows.filter(row => fold(row.map(cellText).join(" ")).includes(fold(query.trim()))) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages);
  const paginated = rows.length > 10;
  const visible = paginated ? filtered.slice((current - 1) * size, current * size) : filtered;
  const description = headers.filter(Boolean).slice(0, 3).join(" · ");
  if (!rows.length) return <div className="no-data"><Table2 size={28} strokeWidth={1.3} aria-hidden="true" /><p>Chưa có dữ liệu trong phạm vi này.</p></div>;
  return <div className="data-table">
    {paginated && <div className="data-table-toolbar"><label className="data-table-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Tìm trong bảng" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm nhanh trong bảng…" />{query && <button type="button" aria-label="Xóa tìm kiếm trong bảng" onClick={() => { setQuery(""); setPage(1); }}><X size={15} /></button>}</label><label className="data-table-size">Số dòng <Select value={String(size)} aria-label="Số dòng mỗi trang" onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>{[10,20,50].map(value => <option key={value} value={value}>{value}</option>)}</Select></label></div>}
    <div className="table-wrap" tabIndex={0} role="region" aria-label={`Bảng dữ liệu: ${description}`}>
      <table><caption className="sr-only">{description}</caption><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header || <span className="sr-only">Thao tác</span>}</th>)}</tr></thead>
        <tbody>{visible.map((row, index) => <tr key={(current - 1) * size + index}>{row.map((cell, column) => <td key={column} data-label={headers[column] || "Thao tác"}>{cell}</td>)}</tr>)}</tbody>
      </table>
      {!filtered.length && <p className="data-table-empty" role="status">Không có dòng khớp với “{query}”.</p>}
    </div>
    {paginated && <div className="data-table-pagination"><span role="status">{filtered.length ? `${(current - 1) * size + 1}–${Math.min(current * size, filtered.length)}` : "0"} / {filtered.length} dòng</span><div><button type="button" aria-label="Trang trước của bảng" disabled={current <= 1} onClick={() => setPage(current - 1)}><ArrowLeft size={15} /></button><span>Trang {current} / {pages}</span><button type="button" aria-label="Trang sau của bảng" disabled={current >= pages} onClick={() => setPage(current + 1)}><ArrowRight size={15} /></button></div></div>}
  </div>;
}
