// src/pages/Usuarios.tsx
import React, {
  Fragment,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";

/* =========================
   Tipos
   ========================= */

type UserRole = "ADMIN" | "WAREHOUSE" | "DRIVER" | "SUPERVISOR";

type Usuario = {
  id: number;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  worker?: {
    id: number;
    fullName: string;
    rut: string;
  } | null;
};

type UsuarioFormState = {
  id?: number;
  email: string;
  role: UserRole | "";
  isActive: boolean;
  password: string;
  confirmPassword: string;
};

/* =========================
   Constantes
   ========================= */

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "ADMIN", label: "ADMIN · Administrador" },
  {
    value: "WAREHOUSE",
    label: "WAREHOUSE · Bodega / Operación",
  },
  { value: "DRIVER", label: "DRIVER · Chofer" },
  {
    value: "SUPERVISOR",
    label: "SUPERVISOR · Supervisor",
  },
];

const emptyForm: UsuarioFormState = {
  email: "",
  role: "WAREHOUSE", // rol por defecto válido
  isActive: true,
  password: "",
  confirmPassword: "",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* =========================
   Página
   ========================= */

export default function UsuariosPage() {
  const queryClient = useQueryClient();

  // Estado UI
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [form, setForm] = useState<UsuarioFormState>(emptyForm);

  // Datos
  const {
    data: usuarios,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const res = await http.get<Usuario[]>("/usuarios");
      return res.data;
    },
  });

  const filteredUsers = useMemo(() => {
    if (!usuarios) return [];
    const term = search.trim().toLowerCase();
    if (!term) return usuarios;

    return usuarios.filter((u) => {
      const email = u.email.toLowerCase();
      const role = (u.role ?? "").toLowerCase();
      const workerName = u.worker?.fullName
        ? u.worker.fullName.toLowerCase()
        : "";
      const rut = u.worker?.rut ? u.worker.rut.toLowerCase() : "";
      return (
        email.includes(term) ||
        role.includes(term) ||
        workerName.includes(term) ||
        rut.includes(term)
      );
    });
  }, [usuarios, search]);

  /* =========================
     Helpers / handlers
     ========================= */

  function openCreate() {
    setEditingUser(null);
    setForm({ ...emptyForm });
    setIsOpen(true);
  }

  function openEdit(u: Usuario) {
    setEditingUser(u);
    setForm({
      id: u.id,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      password: "",
      confirmPassword: "",
    });
    setIsOpen(true);
  }

  function closePanel() {
    if (saving) return;
    setIsOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.email.trim()) {
      alert("El email es obligatorio.");
      return;
    }
    if (!form.role) {
      alert("El rol es obligatorio.");
      return;
    }

    // Validaciones de contraseña:
    if (!editingUser) {
      // CREAR: password obligatoria
      if (!form.password.trim()) {
        alert("La contraseña es obligatoria para crear un usuario.");
        return;
      }
      if (form.password.length < 8) {
        alert(
          "La contraseña debe tener al menos 8 caracteres."
        );
        return;
      }
      if (form.password !== form.confirmPassword) {
        alert("Las contraseñas no coinciden.");
        return;
      }
    } else {
      // EDITAR: password opcional, pero si se escribe, se valida
      if (form.password.trim() || form.confirmPassword.trim()) {
        if (form.password.length < 8) {
          alert(
            "La nueva contraseña debe tener al menos 8 caracteres."
          );
          return;
        }
        if (form.password !== form.confirmPassword) {
          alert("Las contraseñas no coinciden.");
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        email: form.email.trim(),
        role: form.role,
        isActive: form.isActive,
      };

      // Solo enviamos password si se quiere establecer/resetear
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }

      if (editingUser) {
        await http.put(`/usuarios/${editingUser.id}`, payload);
      } else {
        await http.post("/usuarios", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["usuarios"],
      });
      closePanel();
    } catch (err: any) {
      console.error("Error guardando usuario:", err);
      alert(
        err?.response?.data?.error ??
          "Error guardando el usuario. Revisa la consola."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u: Usuario) {
    try {
      setDeletingId(u.id);
      await http.put(`/usuarios/${u.id}`, {
        isActive: !u.isActive,
      });
      await queryClient.invalidateQueries({
        queryKey: ["usuarios"],
      });
    } catch (err: any) {
      console.error("Error cambiando estado de usuario:", err);
      alert(
        err?.response?.data?.error ??
          "Error cambiando el estado del usuario."
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDelete(u: Usuario) {
    const ok = window.confirm(
      `¿Seguro que quieres eliminar al usuario "${u.email}"?\n` +
        "Esta acción es permanente."
    );
    if (!ok) return;

    setDeletingId(u.id);
    try {
      await http.delete(`/usuarios/${u.id}`);
      await queryClient.invalidateQueries({
        queryKey: ["usuarios"],
      });
    } catch (err: any) {
      console.error("Error eliminando usuario:", err);
      alert(
        err?.response?.data?.error ??
          "Error eliminando el usuario. Revisa la consola."
      );
    } finally {
      setDeletingId(null);
    }
  }

  /* =========================
     Render
     ========================= */

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Error cargando usuarios:{" "}
        {String((error as any).message ?? error)}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Encabezado página */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Usuarios del sistema
            </h2>
            <p className="text-sm text-slate-500">
              Administra las cuentas que pueden acceder al sistema
              de inventario, sus roles, estado y contraseñas.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <span>＋</span>
            <span>Nuevo usuario</span>
          </button>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email, rol, nombre o RUT..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {saving && (
            <div className="text-xs text-slate-500">
              Guardando cambios...
            </div>
          )}
        </div>

        {/* Tabla de usuarios */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:pl-6">
                  Usuario
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rol
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 md:table-cell">
                  Trabajador
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 lg:table-cell">
                  Fechas
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Estado
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    Cargando usuarios...
                  </td>
                </tr>
              ) : !filteredUsers ||
                filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No hay usuarios que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const workerLabel = u.worker
                    ? `${u.worker.fullName} (${u.worker.rut})`
                    : "Sin trabajador asociado";

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/60"
                    >
                      {/* Usuario */}
                      <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-slate-900 sm:pl-6">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">
                            {u.email}
                          </span>
                          <span className="text-xs text-slate-500">
                            ID #{u.id}
                          </span>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-700">
                        {u.role}
                      </td>

                      {/* Trabajador */}
                      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-slate-600 md:table-cell">
                        {workerLabel}
                      </td>

                      {/* Fechas */}
                      <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-slate-500 lg:table-cell">
                        <div>Creado: {formatDateTime(u.createdAt)}</div>
                        <div>
                          Actualizado: {formatDateTime(u.updatedAt)}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                              : "bg-slate-100 text-slate-500 ring-1 ring-slate-400/30"
                          }`}
                        >
                          {u.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            disabled={deletingId === u.id}
                            className="rounded-full border border-amber-100 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                          >
                            {u.isActive
                              ? "Desactivar"
                              : "Reactivar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            disabled={deletingId === u.id}
                            className="rounded-full border border-red-100 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingId === u.id
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over formulario de usuario */}
      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={closePanel}
        >
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />

          <div className="fixed inset-0 overflow-hidden">
            <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md bg-white shadow-xl">
                  <form
                    onSubmit={handleSubmit}
                    className="flex h-full flex-col"
                  >
                    {/* Header panel */}
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <Dialog.Title className="text-sm font-semibold text-slate-900">
                        {editingUser
                          ? "Editar usuario"
                          : "Nuevo usuario"}
                      </Dialog.Title>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Contenido panel */}
                    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                      {/* Email */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Email
                        </label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              email: e.target.value,
                            }))
                          }
                          placeholder="usuario@empresa.cl"
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          required
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Debe ser único en el sistema; se usa para el
                          inicio de sesión.
                        </p>
                      </div>

                      {/* Rol */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Rol
                        </label>
                        <select
                          value={form.role}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              role: e.target
                                .value as UserRole,
                            }))
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option
                              key={r.value}
                              value={r.value}
                            >
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Define qué puede hacer este usuario dentro
                          del sistema.
                        </p>
                      </div>

                      {/* Estado */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Estado
                        </label>
                        <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                isActive: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>
                            Usuario activo (puede iniciar sesión)
                          </span>
                        </label>
                      </div>

                      {/* Contraseña */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            {editingUser
                              ? "Nueva contraseña"
                              : "Contraseña"}
                          </label>
                          <input
                            type="password"
                            value={form.password}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                password: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder={
                              editingUser
                                ? "Déjalo vacío para no cambiarla"
                                : "Mínimo 8 caracteres"
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Confirmar contraseña
                          </label>
                          <input
                            type="password"
                            value={form.confirmPassword}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                confirmPassword:
                                  e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="mt-1 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        La contraseña nunca se muestra en texto plano.
                        Aquí solo asignas o reseteas una nueva; el
                        backend la almacena en formato cifrado
                        (hash).
                      </div>
                    </div>

                    {/* Footer panel */}
                    <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
                      <button
                        type="button"
                        onClick={closePanel}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {saving
                          ? "Guardando..."
                          : editingUser
                          ? "Guardar cambios"
                          : "Crear usuario"}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
