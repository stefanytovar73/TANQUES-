import { useEffect, useState } from "react";
import tanqueService from "../services/tanqueService";

export default function useTanques() {
    const [tanques, setTanques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const cargarTanques = async (showLoading = false) => {
        if (showLoading) setLoading(true);

        try {
            const data = await tanqueService.getTanques();
            setTanques(data.tanques || []);
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        cargarTanques(true);
        const intervalo = window.setInterval(() => cargarTanques(false), 60000);
        return () => clearInterval(intervalo);
    }, []);

    return {
        tanques,
        loading,
        error,
        refresh: () => cargarTanques(true),
    };
}
