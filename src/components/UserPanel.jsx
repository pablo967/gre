import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const PERMISSIONS = [
  { key: 'can_upload', label: 'Subir', icon: '⬆' },
  { key: 'can_edit',   label: 'Editar', icon: '✏' },
  { key: 'can_delete', label: 'Eliminar', icon: '🗑' },
];

export default function UserPanel({ onClose }) {
  const { organization, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [roleEdits, setRoleEdits] = useState({});
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

  // Guardar cambio de rol
  const saveRole = async (userId) => {
    const newRole = roleEdits[userId]?.trim();
    if (!newRole) return;
    setSaving(p => ({ ...p, [`role_${userId}`]: true }));
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, role: newRole } : u));
    setRoleEdits(p => { const n = { ...p }; delete n[userId]; return n; });
    setSaving(p => ({ ...p, [`role_${userId}`]: false }));
  };

  // Toggle de permiso
  const togglePermission = async (userId, permKey, currentValue) => {
    setSaving(p => ({ ...p, [`${permKey}_${userId}`]: true }));
    const newVal = !currentValue;
    await supabase.from('profiles').update({ [permKey]: newVal }).eq('id', userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, [permKey]: newVal } : u));
    setSaving(p => ({ ...p, [`${permKey}_${userId}`]: false }));
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-sm shadow-2xl border border-gray-200 animate-slide-up max-h-[88vh] flex flex-col">

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
          <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-3">Código de invitación</p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-widest text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-sm select-all">
              {organization.invite_code}
            </span>
            <button onClick={copyCode} className="btn-secondary text-xs">
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Comparte este código para que nuevos usuarios se unan al registrarse.</p>
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

                return (
                  <div key={user.id} className="border border-gray-100 rounded-sm overflow-hidden">
                    {/* Fila principal */}
                    <div className="flex items-center gap-3 p-3 bg-white">
                      <div className="w-9 h-9 rounded-sm bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {user.full_name}
                          {isMe && <span className="text-xs text-gray-400 font-normal ml-1.5">(tú)</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>

                      {/* Rol editable */}
                      {isMe ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-sm uppercase tracking-wide bg-gray-900 text-white shrink-0">
                          {user.role}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={currentRole}
                            onChange={e => setRoleEdits(p => ({ ...p, [user.id]: e.target.value }))}
                            className="input-field w-28 text-xs py-1.5"
                            placeholder="Rol..."
                          />
                          {roleChanged && (
                            <>
                              <button
                                onClick={() => saveRole(user.id)}
                                disabled={saving[`role_${user.id}`]}
                                className="btn-primary text-xs px-3 py-1.5"
                              >
                                {saving[`role_${user.id}`] ? '...' : 'Guardar'}
                              </button>
                              <button
                                onClick={() => setRoleEdits(p => { const n = { ...p }; delete n[user.id]; return n; })}
                                className="icon-btn text-xs"
                              >✕</button>
                            </>
                          )}
                          {!roleChanged && (
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-sm uppercase tracking-wide shrink-0 ${isAdmin ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                              {user.role}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Permisos (solo para no-admin y no es uno mismo) */}
                    {!isMe && !isAdmin && (
                      <div className="px-3 pb-3 pt-1 bg-slate-50 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 font-medium mr-1">Permisos:</span>
                        {PERMISSIONS.map(({ key, label, icon }) => {
                          const active = user[key] ?? false;
                          const isSaving = saving[`${key}_${user.id}`];
                          return (
                            <button
                              key={key}
                              onClick={() => togglePermission(user.id, key, active)}
                              disabled={isSaving}
                              title={`${active ? 'Quitar' : 'Dar'} permiso: ${label}`}
                              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-sm border transition ${
                                active
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                              } ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              <span>{icon}</span>
                              {label}
                              {active && <span className="text-[10px] opacity-70">✓</span>}
                            </button>
                          );
                        })}
                        <span className="text-[10px] text-gray-300 ml-auto">Ver siempre activo</span>
                      </div>
                    )}

                    {/* Admin: todos los permisos por defecto */}
                    {!isMe && isAdmin && (
                      <div className="px-3 pb-2 pt-1 bg-slate-50 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Acceso total — es administrador</span>
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
