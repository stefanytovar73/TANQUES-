import { useEffect, useMemo, useState } from "react";
import tanqueService from "../services/tanqueService";

export default function useTanques() {
    const initialCached = useMemo(() => tanqueService.peekTanques?.() || null, []);
    const [tanques, setTanques] = useState(() => initialCached?.tanques || []);
    const [loading, setLoading] = useState(() => !(initialCached?.tanques?.length));
    const [error, setError] = useState(null);

    const cargarTanques = async (showLoading = false, forceRefresh = false) => {
        if (showLoading) setLoading(true);

        try {
            const data = await tanqueService.getTanques(forceRefresh);
            setTanques(data.tanques || []);
            setError(null);
        } catch (err) {
            // Si ya había un último dato conocido, conservarlo visible mientras
            // el siguiente refresco intenta recuperar la conexión con IBAL.
            setTanques((prev) => Array.isArray(prev) && prev.length ? prev : []);
            setError(err);
        } finally {
            if (showLoading || forceRefresh) setLoading(false);
        }
    };

    useEffect(() => {
        // Tanques + captación + PTAP arrancan juntos. Los tres comparten promesas
        // y caché, por lo que DistrictFlow reutiliza estos mismos resultados.
        try { tanqueService.preloadDistrictData?.(false); } catch (e) {}

        cargarTanques(!initialCached, false);

        const intervalo = window.setInterval(() => {
            try {
                Promise.allSettled([
                    tanqueService.getCaptacion(true),
                    tanqueService.getPtap(true),
                ]);
            } catch (e) {}
            cargarTanques(false, true);
        }, 30000);

        return () => clearInterval(intervalo);
    }, []);

    return {
        tanques,
        loading,
        error,
        refresh: () => cargarTanques(true, true),
    };
}
