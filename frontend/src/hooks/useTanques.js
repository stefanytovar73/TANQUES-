import { useEffect, useMemo, useState } from "react";
import tanqueService from "../services/tanqueService";

export default function useTanques() {
    // Solo mostrar el conjunto cacheado si ya existen LAS TRES fuentes.
    // Así nunca aparecen primero los tanques y segundos después Macken/caudales.
    const initialBundle = useMemo(() => tanqueService.peekDistrictData?.() || null, []);
    const initialTanques = initialBundle?.tanques?.tanques || [];

    const [tanques, setTanques] = useState(() => initialTanques);
    const [loading, setLoading] = useState(() => !initialTanques.length);
    const [error, setError] = useState(null);

    const cargarTodoDistritos = async (showLoading = false, forceRefresh = false) => {
        if (showLoading) setLoading(true);

        try {
            const bundle = await tanqueService.getDistrictBootstrap(forceRefresh);
            const list = bundle?.tanques?.tanques || [];
            setTanques(list);
            setError(null);
        } catch (err) {
            // Conservar la última pantalla completa si el refresco falla.
            setTanques((prev) => Array.isArray(prev) && prev.length ? prev : []);
            setError(err);
        } finally {
            if (showLoading || forceRefresh) setLoading(false);
        }
    };

    useEffect(() => {
        // Una sola carga lógica: el backend trae tanques + captación + PTAP
        // concurrentemente y la UI se libera cuando las tres ya están listas.
        cargarTodoDistritos(!initialBundle, false);

        const intervalo = window.setInterval(() => {
            cargarTodoDistritos(false, true);
        }, 30000);

        return () => clearInterval(intervalo);
    }, []);

    return {
        tanques,
        loading,
        error,
        refresh: () => cargarTodoDistritos(true, true),
    };
}
