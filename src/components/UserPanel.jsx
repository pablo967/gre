import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

// Plantillas de rol rápidas
const TEMPLATES = [
  {
    id: 'readonly',
    label: 'Solo lectura',
    icon: '👁',
    description: 'Solo puede ver y descargar',
    perms: { can_upload: false, can_edit: false, can_delete: false },
  },
  {
    id: 'colaborador',
    label: 'Colaborador',
    icon: '✏️',
    description: 'Puede subir y editar, no eliminar',
    perms: { can_upload: true, can_edit: true, can_delete: false },
  },
  {
    id: 'editor',
    label: 'Editor completo',
    icon: '🔑',
    description: 'Acceso completo excepto gestión de usuarios',
    perms: { can_upload: true, can_edit: true, can_delete: true },
  },
];

const PERM_LABELS = [
  { key: 'can_upload', label: 'Subir',    icon: '⬆' },
  { key: 'can_edit',   label: 'Editar',   icon: '✏' },
  { key: 'can_delete', label: 'Eliminar', icon: '🗑' },
];

function timeAgo(dateStr) {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function detectTemplate(user) {
  for (const t of TEMPLATES) {
    if (
      t.perms.can_upload === user.can_upload &&
      t.perms.can_edit   === user.can_edit &&
      t.perms.can_delete === user.can_delete
    ) return t.id;
  }
  return null; // permisos personalizados
}

export default function UserPanel({ onClose }) {
  const { organization, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [roleEdits, setRoleEdits] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmAdmin, setConfirmAdmin] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at');
    setUsers(data || []);
    setLoading(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(organization.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Guardar rol (nombre) ────────────────────────────────
  const saveRole = async (userId) => {
    const newRole = roleEdits[userId]?.trim();
    if (!newRole) return;
    setSaving(p => ({ ...p, [`role_${userId}`]: true }));
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, role: newRole } : u));
    setRoleEdits(p => { const n = { ...p }; delete n[userId]; return n; });
    setSaving(p => ({ ...p, [`role_${userId}`]: false }));
  };

  // ── Aplicar plantilla ───────────────────────────────────
  const applyTemplate = async (userId, template) => {
    setSaving(p => ({ ...p, [`tpl_${userId}`]: true }));
    await supabase.from('profiles').update({ role: template.label, ...template.perms }).eq('id', userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, role: template.label, ...template.perms } : u));
    setRoleEdits(p => { const n = { ...p }; delete n[userId]; return n; });
    setSaving(p => ({ ...p, [`tpl_${userId}`]: false }));
  };

  // ── Toggle permiso individual ────────────────────────────
  const togglePerm = async (userId, key, current) => {
    setSaving(p => ({ ...p, [`${key}_${userId}`]: true }));
    const newVal = !current;
    await supabase.from('profiles').update({ [key]: newVal }).eq('id', userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, [key]: newVal } : u));
    setSaving(p => ({ ...p, [`${key}_${userId}`]: false }));
  };

  // ── Promover a admin ─────────────────────────────────────
  const promoteToAdmin = async (userId) => {
    setSaving(p => ({ ...p, [`admin_${userId}`]: true }));
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, role: 'admin' } : u));
    setConfirmAdmin(null);
    setSaving(p => ({ ...p, [`admin_${userId}`]: false }));
  };

  // ── Eliminar usuario ─────────────────────────────────────
  const deleteUser = async (userId) => {
    setSaving(p => ({ ...p, [`del_${userId}`]: true }));
    await supabase.from('profiles').delete().eq('id', userId);
    setUsers(p => p.filter(u => u.id !== userId));
    setConfirmDelete(null);
    setSaving(p => ({ ...p, [`del_${userId}`]: false }));
  };

  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-sm shadow-2xl border border-gray-200 animate-slide-up max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Gestión de usuarios</h2>
            <p className="text-sm text-gray-400">{organization.name}</p>
          </div>
          <button onClick={onClose} className="icon-btn">✕</button>
        </div>

        {/* Código de invitación */}
        <div className="px-6 py-4 bg-slate-50 border-b border-gray-100 shrink-0">
          <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-2">Código de invitación</p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold tracking-widest text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-sm select-all">
              {organization.invite_code}
            </span>
            <button onClick={copyCode} className="btn-secondary text-xs">
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Comparte este código para que nuevos usuarios se unan al registrarse.</p>
        </div>

        {/* Referencia de roles */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 shrink-0">
          <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-2">Roles disponibles</p>
          <div className="flex gap-2 flex-wrap">
            {TEMPLATES.map(t => (
              <div key={t.id} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-gray-200 rounded-sm px-2.5 py-1.5">
                <span>{t.icon}</span>
                <span className="font-semibold text-gray-700">{t.label}</span>
                <span className="text-gray-400">— {t.description}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs bg-gray-900 text-white rounded-sm px-2.5 py-1.5">
              <span>👑</span>
              <span className="font-semibold">Admin</span>
              <span className="opacity-60">— Acceso total + gestión de usuarios</span>
            </div>
          </div>
        </div>

        {/* Lista usuarios */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-4">
            Usuarios ({users.length})
          </p>

          {loading ? (
            <p className="text-sm text-gray-400 animate-pulse">Cargando...</p>
          ) : (
            <div className="space-y-3">
              {users.map(user => {
                const isMe = user.id === profile.id;
                const isAdmin = user.role === 'admin';
                const currentRole = roleEdits[user.id] ?? user.role;
                const roleChanged = roleEdits[user.id] !== undefined && roleEdits[user.id] !== user.role;
                const activeTemplate = detectTemplate(user);
                const isSavingTpl = saving[`tpl_${user.id}`];

                return (
                  <div key={user.id} className="border border-gray-200 rounded-sm overflow-hidden">

                    {/* Fila principal */}
                    <div className="flex items-center gap-3 p-3 bg-white">
                      <div className="w-9 h-9 rounded-sm bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {user.full_name}
                          {isMe && <span className="text-xs text-gray-400 font-normal ml-1.5">(tú)</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Badge admin */}
                        {isAdmin && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-gray-900 text-white uppercase tracking-wide">
                            👑 Admin
                          </span>
                        )}

                        {/* Último acceso */}
                        <span className="text-xs text-gray-300 hidden sm:block">
                          {timeAgo(user.last_seen)}
                        </span>

                        {/* Eliminar (solo si no soy yo y no es el último admin) */}
                        {!isMe && !(isAdmin && adminCount <= 1) && (
                          confirmDelete === user.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => deleteUser(user.id)}
                                disabled={saving[`del_${user.id}`]}
                                className="text-[10px] font-bold px-2 py-1 rounded-sm bg-red-600 text-white hover:bg-red-700 transition"
                              >
                                {saving[`del_${user.id}`] ? '...' : '¿Eliminar?'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-[10px] font-bold px-2 py-1 rounded-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                              >No</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(user.id)}
                              className="icon-btn hover:text-red-500 hover:border-red-300 text-gray-300"
                              title="Eliminar usuario"
                            >🗑</button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Panel de gestión (solo para otros, no-admin) */}
                    {!isMe && !isAdmin && (
                      <div className="border-t border-gray-100 bg-slate-50 p-3 space-y-3">

                        {/* Nombre del rol */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-medium w-16 shrink-0">Nombre:</span>
                          <input
                            type="text"
                            value={currentRole}
                            onChange={e => setRoleEdits(p => ({ ...p, [user.id]: e.target.value }))}
                            className="input-field flex-1 text-xs py-1.5 max-w-[160px]"
                            placeholder="Nombre del rol..."
                          />
                          {roleChanged && (
                            <>
                              <button onClick={() => saveRole(user.id)} disabled={saving[`role_${user.id}`]} className="btn-primary text-xs px-3 py-1.5">
                                {saving[`role_${user.id}`] ? '...' : 'Guardar'}
                              </button>
                              <button onClick={() => setRoleEdits(p => { const n = { ...p }; delete n[user.id]; return n; })} className="icon-btn">✕</button>
                            </>
                          )}
                        </div>

                        {/* Plantillas rápidas */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400 font-medium w-16 shrink-0">Plantilla:</span>
                          {TEMPLATES.map(t => (
                            <button
                              key={t.id}
                              onClick={() => applyTemplate(user.id, t)}
                              disabled={isSavingTpl}
                              title={t.description}
                              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-sm border transition ${
                                activeTemplate === t.id
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                              } ${isSavingTpl ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              {t.icon} {t.label}
                            </button>
                          ))}
                        </div>

                        {/* Permisos individuales */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400 font-medium w-16 shrink-0">Permisos:</span>
                          {PERM_LABELS.map(({ key, label, icon }) => {
                            const active = user[key] ?? false;
                            const isSavingPerm = saving[`${key}_${user.id}`];
                            return (
                              <button
                                key={key}
                                onClick={() => togglePerm(user.id, key, active)}
                                disabled={isSavingPerm}
                                title={`${active ? 'Quitar' : 'Dar'} permiso: ${label}`}
                                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-sm border transition ${
                                  active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                                } ${isSavingPerm ? 'opacity-50 pointer-events-none' : ''}`}
                              >
                                {icon} {label} {active && <span className="opacity-60 text-[10px]">✓</span>}
                              </button>
                            );
                          })}
                        </div>

                        {/* Promover a admin */}
                        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                          <span className="text-xs text-gray-400 font-medium w-16 shrink-0">Admin:</span>
                          {confirmAdmin === user.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">¿Dar acceso total como administrador?</span>
                              <button onClick={() => promoteToAdmin(user.id)} disabled={saving[`admin_${user.id}`]} className="text-[10px] font-bold px-2 py-1 rounded-sm bg-gray-900 text-white hover:bg-black transition">
                                {saving[`admin_${user.id}`] ? '...' : 'Sí, promover'}
                              </button>
                              <button onClick={() => setConfirmAdmin(null)} className="text-[10px] font-bold px-2 py-1 rounded-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition">No</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmAdmin(user.id)}
                              className="text-xs font-semibold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2.5 py-1 rounded-sm bg-white transition flex items-center gap-1"
                            >
                              👑 Promover a administrador
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Admin: acceso total */}
                    {!isMe && isAdmin && (
                      <div className="border-t border-gray-100 bg-slate-50 px-3 py-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Acceso total — administrador</span>
                        {adminCount > 1 && (
                          confirmDelete === user.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => deleteUser(user.id)} disabled={saving[`del_${user.id}`]} className="text-[10px] font-bold px-2 py-1 rounded-sm bg-red-600 text-white hover:bg-red-700 transition">
                                {saving[`del_${user.id}`] ? '...' : '¿Eliminar?'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)} className="text-[10px] px-2 py-1 rounded-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(user.id)} className="text-xs text-gray-300 hover:text-red-500 transition">🗑 Eliminar</button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
