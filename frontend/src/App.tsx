import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./context/SessionContext";
import LoginPage from "./pages/LoginPage";
import TaskPage from "./pages/TaskPage";
import SummaryPage from "./pages/SummaryPage";

function App() {
  const { session } = useSession();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/task"
          element={session ? <TaskPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/summary"
          element={session ? <SummaryPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
