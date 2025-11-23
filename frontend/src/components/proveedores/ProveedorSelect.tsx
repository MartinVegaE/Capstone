import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type ProveedorLite = {
  id: number;
  nombre: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
};

interface ProveedorSelectProps {
  value: ProveedorLite | null;
  onChange: (prov: ProveedorLite | null) => void;
}

export function ProveedorSelect({ value, onChange }: ProveedorSelectProps) {
  const [search, setSearch] = useState("");

  const { data: proveedores = [], isLoading, isError } = useQuery<ProveedorLite[]>({
    queryKey: ["proveedores", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("incluirInactivos", "0");
      if (search.trim() !== "") {
        params.set("q", search.trim());
      }

      const res = await fetch(`http://localhost:4000/proveedores?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Error cargando proveedores");
      }
      return res.json();
    },
  });

  const handleSelect = (prov: ProveedorLite) => {
    onChange(prov);
  };

  const handleClear = () => {
    onChange(null);
    setSearch("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        Proveedor
      </label>

      {/* Muestra proveedor seleccionado */}
      {value && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <div>
            <div className="font-medium">{value.nombre}</div>
            <div className="text-xs text-emerald-800">
              {value.rut || "Sin RUT"}
              {value.email ? ` · ${value.email}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-semibold text-emerald-900 hover:underline"
          >
            Quitar
          </button>
        </div>
      )}

      {/* Buscador + lista */}
      <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar proveedor por nombre o RUT..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
        />

        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
          {isLoading && (
            <div className="px-2 py-1 text-xs text-slate-500">
              Cargando proveedores...
            </div>
          )}

          {isError && (
            <div className="px-2 py-1 text-xs text-red-600">
              Error al cargar proveedores.
            </div>
          )}

          {!isLoading && !isError && proveedores.length === 0 && (
            <div className="px-2 py-1 text-xs text-slate-500">
              No se encontraron proveedores.
            </div>
          )}

          {!isLoading &&
            !isError &&
            proveedores.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className={`flex w-full flex-col rounded-md px-2 py-1 text-left hover:bg-white ${
                  value?.id === p.id ? "bg-white ring-1 ring-rose-400" : ""
                }`}
              >
                <span className="font-medium text-slate-900">
                  {p.nombre}
                </span>
                <span className="text-[11px] text-slate-500">
                  {p.rut || "Sin RUT"}
                  {p.email ? ` · ${p.email}` : ""}
                  {p.telefono ? ` · ${p.telefono}` : ""}
                </span>
              </button>
            ))}
        </div>

        <p className="text-xs text-slate-500">
          Primero crea los proveedores en el módulo correspondiente y luego
          selecciónalos aquí.
        </p>
      </div>
    </div>
  );
}
