import { Navigate, Route, Routes } from "react-router";
import NavBar from "./components/NavBar";
import OfflineNotice from "./components/OfflineNotice";
import AboutPage from "./pages/AboutPage";
import HomePage from "./pages/HomePage";

export default function App() {
  return (
    <>
      <NavBar />
      <OfflineNotice />
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
