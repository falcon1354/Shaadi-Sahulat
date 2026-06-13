import React, { useState } from 'react';
import Wizard from './components/Wizard';

function App() {
  const [userId] = useState(() => 'user-' + Math.random().toString(36).substr(2, 9));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-purple-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">ShaadiSahulat</h1>
              <p className="text-xs text-gray-500">Dowry Estimation Module</p>
            </div>
          </div>
          <span className="text-sm text-gray-400">User: {userId}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Wizard userId={userId} />
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-sm text-gray-400 border-t border-gray-100">
        ShaadiSahulat — FYP 2026 | NUCES Chiniot-Faisalabad
      </footer>
    </div>
  );
}

export default App;
