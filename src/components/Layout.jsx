import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import UserPanel from './UserPanel';

const Layout = ({ children }) => {
  const { profile, organization, signOut } = useAuth();
  const [showUserPanel, setShowUserPanel] = useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden text-slate-900">
      {profile && (
        <header className="h-14 shrink-0 bg-white border-b border-gray-200 px-5 flex items-center justify-between gap-4">
          {/* Marca / empresa */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gray-900 rounded-sm flex items-center justify-center text-white text-sm shrink-0">
              📁
            </div>
            <span className="font-bold text-gray-900 text-sm truncate max-w-[160px] sm:max-w-xs">
              {organization?.name || 'Resource Hub'}
            </span>
          </div>

          {/* Usuario */}
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-gray-700 font-medium hidden sm:block truncate max-w-[140px]">
              {profile.full_name}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide whitespace-nowrap ${profile.role === 'admin' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
              {profile.role}
            </span>

            {profile.role === 'admin' && (
              <button
                onClick={() => setShowUserPanel(true)}
                className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
              >
                Equipo
              </button>
            )}

            <button
              onClick={signOut}
              className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
            >
              Salir
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative">
        {children}
      </main>

      {showUserPanel && <UserPanel onClose={() => setShowUserPanel(false)} />}
    </div>
  );
};

export default Layout;
