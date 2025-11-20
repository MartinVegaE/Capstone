// src/pages/Dashboard.tsx
import React, { useState, type FormEvent } from "react";
import {
  useCategorias,
  useCreateCategoria,
  useMarcas,
  useCreateMarca,
  useBodegas,
  useCreateBodega,
  useProyectos,
  useCreateProyecto,
} from "../api/catalogs";
import Button from "../components/ui/Button";

export default function DashboardPage() {
  return (
    <section className="w-full px-6 pb-6">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">
        Panel principal
      </h1>
      <p className="mb-6 text-sm text-slate-600 max-w-2xl">
        Administra los catálogos básicos que luego usarás en productos,
        ingresos y movimientos: categorías, marcas, bodegas y proyectos.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <CategoriasCard />
        <MarcasCard />
        <BodegasCard />
        <ProyectosCard />
      </div>
    </section>
  );
}

// --------- Cards específicas ---------

function CategoriasCard() {
  const { data, isLoading, isError } = useCategorias();
  const createMut = useCreateCategoria();
  const [nombre, setNombre] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) return;
    createMut.mutate(n, {
      onSuccess: () => setNombre(""),
      onError: () => alert("No se pudo crear la categoría"),
    });
  }

  return (
    <Card
      title="Categorías"
      subtitle="Ejemplo: Extintores, Mangueras, EPP, Herramientas, etc."
    >
      <form
        onSubmit={onSubmit}
        className="mb-3 flex gap-2 text-sm"
      >
        <input
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          placeholder="Nombre de categoría"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Button
          type="submit"
          disabled={createMut.isPending}
        >
          Agregar
        </Button>
      </form>

      <CatalogList
        isLoading={isLoading}
        isError={isError}
        items={data?.map((c) => c.nombre) ?? []}
        emptyText="No hay categorías registradas."
      />
    </Card>
  );
}

function MarcasCard() {
  const { data, isLoading, isError } = useMarcas();
  const createMut = useCreateMarca();
  const [nombre, setNombre] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) return;
    createMut.mutate(n, {
      onSuccess: () => setNombre(""),
      onError: () => alert("No se pudo crear la marca"),
    });
  }

  return (
    <Card
      title="Marcas"
      subtitle="Ejemplo: Kidde, Dräger, Honeywell, etc."
    >
      <form
        onSubmit={onSubmit}
        className="mb-3 flex gap-2 text-sm"
      >
        <input
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          placeholder="Nombre de marca"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Button
          type="submit"
          disabled={createMut.isPending}
        >
          Agregar
        </Button>
      </form>

      <CatalogList
        isLoading={isLoading}
        isError={isError}
        items={data?.map((m) => m.nombre) ?? []}
        emptyText="No hay marcas registradas."
      />
    </Card>
  );
}

function BodegasCard() {
  const { data, isLoading, isError } = useBodegas();
  const createMut = useCreateBodega();
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    const c = codigo.trim();
    if (!n) return;
    createMut.mutate(
      { nombre: n, codigo: c || undefined },
      {
        onSuccess: () => {
          setNombre("");
          setCodigo("");
        },
        onError: () => alert("No se pudo crear la bodega"),
      }
    );
  }

  return (
    <Card
      title="Bodegas"
      subtitle="Se usan para separar stock por ubicación física (ej: Bodega 1, Camión 3, etc.)."
    >
      <form
        onSubmit={onSubmit}
        className="mb-3 flex gap-2 text-sm"
      >
        <input
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          placeholder="Bodega 1"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <input
          className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          placeholder="Código (opcional)"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        <Button
          type="submit"
          disabled={createMut.isPending}
        >
          Agregar
        </Button>
      </form>

      <CatalogList
        isLoading={isLoading}
        isError={isError}
        items={
          data?.map((b) =>
            b.codigo ? `${b.nombre} · ${b.codigo}` : b.nombre
          ) ?? []
        }
        emptyText="No hay bodegas registradas."
      />
    </Card>
  );
}

function ProyectosCard() {
  const { data, isLoading, isError } = useProyectos();
  const createMut = useCreateProyecto();
  const [nombre, setNombre] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) return;
    createMut.mutate(n, {
      onSuccess: () => setNombre(""),
      onError: () => alert("No se pudo crear el proyecto"),
    });
  }

  return (
    <Card
      title="Proyectos"
      subtitle="Proyectos u obras a las que se imputan las salidas y retornos de materiales."
    >
      <form
        onSubmit={onSubmit}
        className="mb-3 flex gap-2 text-sm"
      >
        <input
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          placeholder="Nombre de proyecto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Button
          type="submit"
          disabled={createMut.isPending}
        >
          Agregar
        </Button>
      </form>

      <CatalogList
        isLoading={isLoading}
        isError={isError}
        items={data?.map((p) => p.nombre) ?? []}
        emptyText="No hay proyectos registrados."
      />
    </Card>
  );
}

// --------- Componentes pequeños de apoyo ---------

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CatalogList({
  isLoading,
  isError,
  items,
  emptyText,
}: {
  isLoading: boolean;
  isError: boolean;
  items: string[];
  emptyText: string;
}) {
  if (isLoading) {
    return (
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-200" />
    );
  }
  if (isError) {
    return (
      <p className="mt-2 text-xs text-red-600">
        Error al cargar datos
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="mt-2 text-xs text-slate-500">{emptyText}</p>
    );
  }
  return (
    <ul className="mt-2 space-y-1 text-xs text-slate-700">
      {items.map((it) => (
        <li key={it} className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
