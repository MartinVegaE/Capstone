// src/pages/Dashboard.tsx
import React from "react";
import { Link } from "react-router-dom";

export default function DashboardPage() {
  const now = new Date();
  const hour = now.getHours();


  const today = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <section className="w-full px-6 pb-6">
      {/* Encabezado */}
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-500">
            Fire Prevention · Inventario
          </p>
          
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Revisa de un vistazo el estado del inventario, registra movimientos
            críticos y navega rápidamente a los módulos de trabajo diario:
            productos, proyectos, proveedores y devoluciones.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 text-xs sm:items-end">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-700">
              Sistema operativo
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 capitalize">{today}</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Tip: puedes volver aquí en cualquier momento desde el menú lateral.
          </p>
        </div>
      </header>

      {/* Tarjetas principales */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          accent="indigo"
          icon="📦"
          title="Inventario de productos"
          description="Mantén el catálogo al día, controla stock mínimo y revisa movimientos de entrada y salida."
          primaryLink={{ to: "/productos", label: "Ir a productos" }}
          secondaryLinks={[
            { to: "/movimientos", label: "Movimientos de stock" },
            { to: "/ingresos", label: "Ingresos de mercadería" },
          ]}
          chips={["SKUs críticos", "Stock mínimo", "Lotes en tránsito"]}
        />

        <DashboardCard
          accent="emerald"
          icon="🏗️"
          title="Proyectos y obras"
          description="Gestiona las salidas hacia obra y los retornos al inventario para mantener trazabilidad por proyecto."
          primaryLink={{
            to: "/proyectos/salidas",
            label: "Salidas a proyectos",
          }}
          secondaryLinks={[
            { to: "/proyectos/retornos", label: "Retornos de proyectos" },
          ]}
          chips={["Material en obra", "Devoluciones pendientes"]}
        />

        <DashboardCard
          accent="rose"
          icon="🤝"
          title="Proveedores y devoluciones"
          description="Administra el maestro de proveedores y registra devoluciones de materiales hacia ellos."
          primaryLink={{ to: "/proveedores", label: "Ver proveedores" }}
          secondaryLinks={[
            {
              to: "/devoluciones/proveedor",
              label: "Devoluciones a proveedor",
            },
          ]}
          chips={["OC abiertas", "Garantías", "Material defectuoso"]}
        />
      </div>
    </section>
  );
}

type Accent = "indigo" | "emerald" | "rose";

type DashboardCardProps = {
  accent: Accent;
  icon: string;
  title: string;
  description: string;
  primaryLink: { to: string; label: string };
  secondaryLinks?: { to: string; label: string }[];
  chips?: string[];
};

const accentStyles: Record<
  Accent,
  {
    card: string;
    badge: string;
    button: string;
    buttonHover: string;
  }
> = {
  indigo: {
    card:
      "border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-50",
    badge: "bg-indigo-100 text-indigo-700",
    button: "bg-indigo-600",
    buttonHover: "hover:bg-indigo-700",
  },
  emerald: {
    card:
      "border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50",
    badge: "bg-emerald-100 text-emerald-700",
    button: "bg-emerald-600",
    buttonHover: "hover:bg-emerald-700",
  },
  rose: {
    card:
      "border-rose-100 bg-gradient-to-br from-rose-50 via-white to-slate-50",
    badge: "bg-rose-100 text-rose-700",
    button: "bg-rose-500",
    buttonHover: "hover:bg-rose-600",
  },
};

function DashboardCard({
  accent,
  icon,
  title,
  description,
  primaryLink,
  secondaryLinks = [],
  chips = [],
}: DashboardCardProps) {
  const styles = accentStyles[accent];

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${styles.card}`}
    >
      <div className="flex-1">
        <div className="mb-3 flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-2xl text-lg shadow-sm ${styles.badge}`}
          >
            <span aria-hidden>{icon}</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <p className="text-sm text-slate-600">{description}</p>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Link
          to={primaryLink.to}
          className={`inline-flex w-full justify-center rounded-xl px-3 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 ${styles.button} ${styles.buttonHover}`}
        >
          {primaryLink.label}
        </Link>

        {secondaryLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {secondaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
