import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Terminal from './components/terminal/Terminal';
import GamePromptWizard from './components/wizard/GamePromptWizard';
import ImportExport from './components/admin/ImportExport';
import SystemStatus from './components/admin/SystemStatus';
import ChatRoutes from './chat';
import './App.css';

function App() {
  return (
    <div className="app-shell">
      <Router>
        <Routes>
          <Route path="/" element={<Terminal />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/wizard" element={<GamePromptWizard />} />
          <Route path="/door-wizard" element={<GamePromptWizard />} />
          <Route path="/admin/import" element={<ImportExport />} />
          <Route path="/system" element={<SystemStatus />} />
          {/* Standalone web chat */}
          <Route path="/chat/*" element={<ChatRoutes />} />
          {/* Catch-all redirect to main terminal */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
