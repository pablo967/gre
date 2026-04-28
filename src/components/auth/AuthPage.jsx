import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="text-xs text-red-600 mt-1">{msg}</p>;
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}

export default function AuthPage() {
  const { skipAuthChange, refreshProfile } = useAuth();

  const [tab, setTab] = useState('login');
  const [registerMode, setRegisterMode] = useState('create');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [successCode, setSuccessCode] = useState('');

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState({});

  // Registro
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [regErrors, setRegErrors] = useState({});

  const switchTab = (t) => { setTab(t); setGlobalError(''); setLoginErrors({}); setRegErrors({}); };

  // ── Validaciones Login ────────────────────────────────────
  const validateLogin = () => {
    const errs = {};
    if (!loginEmail.trim()) errs.email = 'El email es obligatorio.';
    else if (!emailRegex.test(loginEmail)) errs.email = 'Introduce un email válido.';
    if (!loginPassword) errs.password = 'La contraseña es obligatoria.';
    setLoginErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setGlobalError('');
    if (!validateLogin()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setGlobalError(traducirError(error.message));
    setLoading(false);
  };

  // ── Validaciones Registro ─────────────────────────────────
  const validateRegister = () => {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'El nombre es obligatorio.';
    else if (fullName.trim().length < 2) errs.fullName = 'Mínimo 2 caracteres.';

    if (!email.trim()) errs.email = 'El email es obligatorio.';
    else if (!emailRegex.test(email)) errs.email = 'Introduce un email válido.';

    if (!password) errs.password = 'La contraseña es obligatoria.';
    else if (password.length < 6) errs.password = 'Mínimo 6 caracteres.';

    if (registerMode === 'create') {
      if (!companyName.trim()) errs.companyName = 'El nombre de empresa es obligatorio.';
      else if (companyName.trim().length < 2) errs.companyName = 'Mínimo 2 caracteres.';
    } else {
      if (!inviteCode.trim()) errs.inviteCode = 'El código es obligatorio.';
      else if (inviteCode.trim().length !== 8) errs.inviteCode = 'El código debe tener exactamente 8 caracteres.';
    }

    setRegErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setGlobalError('');
    if (!validateRegister()) return;
    setLoading(true);
    skipAuthChange.current = true;

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('No se pudo crear el usuario. El email puede que ya esté registrado.');

      const userId = authData.user.id;

      if (registerMode === 'create') {
        const code = generateInviteCode();
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert([{ name: companyName.trim(), invite_code: code }])
          .select()
          .single();
        if (orgError) throw orgError;

        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: userId, organization_id: org.id, full_name: fullName.trim(), email, role: 'admin' }]);
        if (profileError) throw profileError;

        setSuccessCode(code);
      } else {
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('invite_code', inviteCode.trim().toUpperCase())
          .single();

        if (orgError || !org) throw new Error('Código de invitación no válido. Comprueba que esté bien escrito.');

        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: userId, organization_id: org.id, full_name: fullName.trim(), email, role: 'member' }]);
        if (profileError) throw profileError;
      }

      skipAuthChange.current = false;
      await refreshProfile();
    } catch (err) {
      skipAuthChange.current = false;
      setGlobalError(traducirError(err.message));
    }

    setLoading(false);
  };

  const traducirError = (msg) => {
    if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
    if (msg.includes('User already registered') || msg.includes('already been registered')) return 'Este email ya está registrado. Prueba a iniciar sesión.';
    if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (msg.includes('Unable to validate')) return 'Email o contraseña incorrectos.';
    return msg;
  };

  const inputClass = (err) =>
    `input-field ${err ? 'border-red-400 focus:border-red-500 focus:ring-red-400' : ''}`;

  if (successCode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-sm mb-6">
            <span className="text-2xl text-white">📁</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">¡Empresa creada!</h2>
            <p className="text-sm text-gray-500 mb-6">
              Guarda este código y compártelo con los usuarios que quieras añadir.
            </p>
            <div className="bg-slate-50 border border-gray-200 rounded-sm p-4 mb-6">
              <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-2">Código de invitación</p>
              <p className="font-mono text-3xl font-bold tracking-widest text-gray-900">{successCode}</p>
            </div>
            <button onClick={refreshProfile} className="btn-primary w-full">
              Entrar al Resource Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-sm mb-4">
            <span className="text-2xl text-white">📁</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Resource Hub</h1>
          <p className="text-gray-500 text-sm mt-1">Repositorio Corporativo de Documentos</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-8">
          {/* Tabs */}
          <div className="flex mb-6 bg-slate-100 rounded-sm p-1 gap-1">
            <button onClick={() => switchTab('login')} className={`flex-1 py-2 text-sm font-semibold rounded-sm transition ${tab === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Iniciar sesión
            </button>
            <button onClick={() => switchTab('register')} className={`flex-1 py-2 text-sm font-semibold rounded-sm transition ${tab === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Registrarse
            </button>
          </div>

          {globalError && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-sm text-sm text-red-700 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{globalError}</span>
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <Field label="Email" error={loginErrors.email}>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => { setLoginEmail(e.target.value); setLoginErrors(p => ({ ...p, email: '' })); }}
                  className={inputClass(loginErrors.email)}
                  placeholder="tu@empresa.com"
                />
              </Field>

              <Field label="Contraseña" error={loginErrors.password}>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setLoginErrors(p => ({ ...p, password: '' })); }}
                  className={inputClass(loginErrors.password)}
                  placeholder="••••••••"
                />
              </Field>

              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading ? 'Entrando...' : 'Iniciar sesión'}
              </button>
            </form>
          ) : (
            <div>
              <div className="flex gap-1 mb-5 bg-slate-100 rounded-sm p-1">
                <button type="button" onClick={() => { setRegisterMode('create'); setRegErrors({}); }} className={`flex-1 py-1.5 text-xs font-semibold rounded-sm transition ${registerMode === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Crear empresa nueva
                </button>
                <button type="button" onClick={() => { setRegisterMode('join'); setRegErrors({}); }} className={`flex-1 py-1.5 text-xs font-semibold rounded-sm transition ${registerMode === 'join' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Unirme a empresa
                </button>
              </div>

              <form onSubmit={handleRegister} className="space-y-4" noValidate>
                <Field label="Nombre completo" error={regErrors.fullName}>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => { setFullName(e.target.value); setRegErrors(p => ({ ...p, fullName: '' })); }}
                    className={inputClass(regErrors.fullName)}
                    placeholder="Juan García"
                  />
                </Field>

                <Field label="Email" error={regErrors.email}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setRegErrors(p => ({ ...p, email: '' })); }}
                    className={inputClass(regErrors.email)}
                    placeholder="tu@empresa.com"
                  />
                </Field>

                <Field label="Contraseña" error={regErrors.password}>
                  <div className="space-y-1.5">
                    <input
                      type="password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setRegErrors(p => ({ ...p, password: '' })); }}
                      className={inputClass(regErrors.password)}
                      placeholder="Mínimo 6 caracteres"
                    />
                    {/* Barra de fuerza */}
                    {password.length > 0 && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(n => {
                          const strength = password.length >= 10 && /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
                            : password.length >= 8 ? 3
                            : password.length >= 6 ? 2 : 1;
                          const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];
                          return (
                            <div key={n} className={`h-1 flex-1 rounded-full transition-all ${n <= strength ? colors[strength - 1] : 'bg-gray-200'}`} />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Field>

                {registerMode === 'create' ? (
                  <Field label="Nombre de la empresa" error={regErrors.companyName}>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => { setCompanyName(e.target.value); setRegErrors(p => ({ ...p, companyName: '' })); }}
                      className={inputClass(regErrors.companyName)}
                      placeholder="Acme Corporation"
                    />
                  </Field>
                ) : (
                  <Field label="Código de invitación" error={regErrors.inviteCode}>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={e => { setInviteCode(e.target.value.toUpperCase()); setRegErrors(p => ({ ...p, inviteCode: '' })); }}
                      className={`${inputClass(regErrors.inviteCode)} font-mono tracking-widest uppercase`}
                      placeholder="XXXXXXXX"
                      maxLength={8}
                    />
                    <p className="text-xs text-gray-400 mt-1">Pídelo al administrador de tu empresa</p>
                  </Field>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                  {loading ? 'Creando cuenta...' : registerMode === 'create' ? 'Crear empresa y cuenta' : 'Unirme a la empresa'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
