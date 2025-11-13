import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Terminal from './components/terminal/Terminal';
import GamePromptWizard from './components/wizard/GamePromptWizard';
import ImportExport from './components/admin/ImportExport';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Terminal />} />
        <Route path="/wizard" element={<GamePromptWizard />} />
        <Route path="/door-wizard" element={<GamePromptWizard />} />
        <Route path="/admin/import" element={<ImportExport />} />
      </Routes>
    </Router>
  );
}

export default App;
