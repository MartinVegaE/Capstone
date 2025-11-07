import React from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";

export type ViewMode = "list" | "kanban";

export default function ControlPanel({
  search,
  onSearch,
  view,
  onChangeView,
  onOpenFilters,
  onToggleFavorite,
  onOpenGroupBy,
}: {
  search: string;
  onSearch: (v: string) => void;
  view: ViewMode;
  onChangeView: (v: ViewMode) => void;
  onOpenFilters?: () => void;
  onOpenGroupBy?: () => void;
  onToggleFavorite?: () => void;
}) {
  return (
    <div className="w-full border-b bg-white/70 backdrop-blur">
      <div className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center">
        {/* Izquierda: buscador */}
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-full sm:max-w-xl">
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Buscar por SKU, nombre, marca..."
              className="pl-9"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
          </div>

          {onOpenFilters && (
            <Button variant="secondary" size="sm" onClick={onOpenFilters} title="Filtros">
              Filtros
            </Button>
          )}
          {onOpenGroupBy && (
            <Button variant="secondary" size="sm" onClick={onOpenGroupBy} title="Agrupar">
              Agrupar
            </Button>
          )}
        </div>

        {/* Derecha: toggles */}
        <div className="flex shrink-0 items-center gap-2">
          {onToggleFavorite && (
            <Button variant="ghost" size="sm" onClick={onToggleFavorite} title="Favoritos">
              ⭐
            </Button>
          )}

          <div className="hidden h-6 w-px bg-slate-200 sm:block" />

          <Button
            size="sm"
            variant={view === "list" ? "primary" : "secondary"}
            onClick={() => onChangeView("list")}
            title="Vista lista"
          >
            Lista
          </Button>
          <Button
            size="sm"
            variant={view === "kanban" ? "primary" : "secondary"}
            onClick={() => onChangeView("kanban")}
            title="Vista kanban"
          >
            Kanban
          </Button>
        </div>
      </div>
    </div>
  );
}
