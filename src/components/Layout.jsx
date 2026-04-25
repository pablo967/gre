import React from 'react';

const Layout = ({ children }) => {
  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden text-slate-900">
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative">
        {children}
      </main>
    </div>
  );
};

export default Layout;
