import { useEffect, useState } from "react";
import tanqueService from "../services/tanqueService";

export default function useTanques() {
    const [tanques, setTanques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // forceRefresh=true fuerza una nueva solicitud a la API ignorando el caché
    const cargarTanques = async (showLoading = false, forceRefresh = false) => {
        if (showLoading) setLoading(true);

        try {
            const data = await tanqueService.getTanques(forceRefresh);
            setTanques(data.tanques || []);
            setError(null);
        } catch (err) {
            // On any error from IBAL/backend do not preserve previous data.
            // Clear `tanques` so UI does not display stale data as current.
            setTanques([]);
            setError(err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        cargarTanques(true);
        // Sondeo cada 30 s con forceRefresh=true para bypassar el caché
        const intervalo = window.setInterval(() => cargarTanques(false, true), 30000);
        return () => clearInterval(intervalo);
    }, []);

    return {
        tanques,
        loading,
        error,
        refresh: () => cargarTanques(true),
    };
}
