import { Route, Routes } from "react-router-dom";
import { Editor } from "./Editor";

export function App() {
  return (
    <Routes>
      <Route path="/editor" element={<Editor />} />
      <Route path="/editor/:slug" element={<Editor />} />
    </Routes>
  );
}
