import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";
import Inicio from "../pages/Inicio/Inicio";
import Dashboard from "../pages/Dashboard/Dashboard";
import Tanques from "../pages/Tanques/Tanques";
import Distritos from "../pages/Distritos/Distritos";
import Monitoreo from "../pages/Monitoreo/Monitoreo";
import Historicos from "../pages/Historicos/Historicos";
import Reportes from "../pages/Reportes/Reportes";
import Configuracion from "../pages/Configuracion/Configuracion";
import NotFound from "../pages/NotFound/NotFound";

export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<MainLayout />}>
                    {/* In development, default to /distritos so editor preview and browser show same screen */}
                    <Route index element={import.meta.env.DEV ? <Navigate to="/distritos" replace /> : <Inicio />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="tanques" element={<Tanques />} />
                    <Route path="distritos" element={<Distritos />} />
                    <Route path="monitoreo" element={<Monitoreo />} />
                    <Route path="historicos" element={<Historicos />} />
                    <Route path="reportes" element={<Reportes />} />
                    <Route path="configuracion" element={<Configuracion />} />
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}