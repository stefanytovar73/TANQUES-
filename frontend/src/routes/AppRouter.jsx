import { BrowserRouter, Routes, Route } from "react-router-dom";
import React, { lazy, Suspense } from 'react';

import MainLayout from "../layouts/MainLayout";
const Inicio = lazy(() => import('../pages/Inicio/Inicio'));
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Tanques = lazy(() => import('../pages/Tanques/Tanques'));
const Distritos = lazy(() => import('../pages/Distritos/Distritos'));
const Monitoreo = lazy(() => import('../pages/Monitoreo/Monitoreo'));
const Historicos = lazy(() => import('../pages/Historicos/Historicos'));
const Reportes = lazy(() => import('../pages/Reportes/Reportes'));
const Configuracion = lazy(() => import('../pages/Configuracion/Configuracion'));
const NotFound = lazy(() => import('../pages/NotFound/NotFound'));

export default function AppRouter() {
    return (
        <BrowserRouter>
                    <Suspense fallback={null}>
                    <Routes>
                        <Route element={<MainLayout />}>
                            <Route index element={<Inicio />} />
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
                    </Suspense>
        </BrowserRouter>
    );
}