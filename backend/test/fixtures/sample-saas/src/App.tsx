import { Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";

export function App() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
