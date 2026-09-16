import { useEffect, useState } from "react";
import tanqueService from "../services/tanqueService";

export default function useTanques() {
    const initialCached = tanqueService.peekTanques?.() || null;
    const [tanques, setTanques] = useState(() => (initialCached && Array.isArray(initialCached.tanques) ? initialCached.tanques : []));
    const [loading, setLoading] = useState(() => !(initialCached && Array.isArray(initialCached.tanques)));
    const [error, setError] = useState(null);

    // forceRefresh=true fuerza una nueva solicitud a la API ignorando el caché
    const cargarTanques = async (showLoading = false, forceRefresh = false) => {
        if (showLoading) setLoading(true);

        try {
            const data = await tanqueService.getTanques(forceRefresh);
            setTanques(data.tanques || []);
            setError(null);
        } catch (err) {
            // Si ya mostramos el último payload conocido, conservarlo mientras
            // se recupera la conexión. Así una recarga no deja Distritos vacío.
            setTanques((prev) => (Array.isArray(prev) && prev.length ? prev : []));
            setError(err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        // Arrancar tanques + captación + PTAP en paralelo desde el primer instante.
        // getTanques reutiliza la misma promesa, así que no duplica la solicitud.
        try { tanqueService.preloadDistrictData?.(false); } catch (e) {}

        // Si ya existe un payload reciente, pintar inmediatamente y refrescar en
        // segundo plano. En una entrada en frío seguimos mostrando el layout
        // estático mientras llega la API.
        cargarTanques(!initialCached, false);

        // Refrescar las tres fuentes cada 30 s sin duplicar /tanques.
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
        refresh: () => cargarTanques(true),
    };
}
