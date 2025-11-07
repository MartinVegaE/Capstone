import React from "react";

type Props<T> = {
  columns: string[];
  items: T[];
  columnOf: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onOpen?: (item: T) => void;
  emptyText?: string;
};

export default function KanbanBoard<T>({
  columns,
  items,
  columnOf,
  renderCard,
  onOpen,
  emptyText = "Sin elementos",
}: Props<T>) {
  return (
    <div className="w-full px-6 py-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => {
          const colItems = items.filter((it) => (columnOf(it) || "").toString() === col);
          return (
            <div key={col} className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b px-4 py-3 text-sm font-semibold text-slate-700">
                {col} <span className="text-slate-400">· {colItems.length}</span>
              </div>
              <div className="space-y-3 px-3 py-3">
                {colItems.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-slate-500">
                    {emptyText}
                  </div>
                ) : (
                  colItems.map((it, i) => (
                    <button
                      key={i}
                      onClick={() => onOpen?.(it)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm hover:bg-slate-50"
                    >
                      {renderCard(it)}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
