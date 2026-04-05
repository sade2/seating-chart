import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <HomePage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/project/:id"
                    element={
                        <ProtectedRoute>
                            <ProjectPage />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}
