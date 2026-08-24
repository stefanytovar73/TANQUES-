import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography, CircularProgress, Alert, Paper } from "@mui/material";
import OpacityIcon from "@mui/icons-material/Opacity";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import WifiIcon from "@mui/icons-material/Wifi";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import TanqueCard from "../../components/dashboard/TanqueCard";
import tanqueService from "../../services/tanqueService";
import { loadCatalog, mergeApiTanquesWithCatalog, normalizeText, calculateDisplayPorcentaje } from "../../config/tankCatalog";

const getTankStatusColor = (porcentaje) => {
    if (!Number.isFinite(Number(porcentaje))) return "#9DA9BB";
    if (porcentaje < 20) return "#D32F2F";
    if (porcentaje < 40) return "#F59E0B";
    if (porcentaje < 95) return "#1565C0";
    return "#2E7D32";
};

const getTankStatusLabel = (porcentaje) => {
    if (!Number.isFinite(Number(porcentaje))) return "Sin datos";
    if (porcentaje < 20) return "Crítico";
    if (porcentaje < 40) return "Atención";
    if (porcentaje < 95) return "Llenándose";
    return "Normal";
};

export default function Inicio() {
    const [tanques, setTanques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchTanques = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setLoading(true);
        }

        try {
            const response = await tanqueService.getTanques(!showLoading);
            const catalog = loadCatalog();
            const merged = mergeApiTanquesWithCatalog(response.tanques || [], catalog);
            setTanques(merged);
            setError("");
        } catch (err) {
            console.error(err);
            if (showLoading) {
                setError("No fue posible obtener la información de los tanques.");
            }
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchTanques();
        const interval = setInterval(() => fetchTanques(false), 60000);
        return () => clearInterval(interval);
    }, [fetchTanques]);

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const systemSummary = useMemo(() => {
        const totalFlow = tanques.reduce((sum, tank) => {
            const value = Number.isFinite(Number(tank.volumen_restante_m3))
                ? Number(tank.volumen_restante_m3)
                : Number.isFinite(Number(tank.capacidad_actual_m3))
                    ? Number(tank.capacidad_actual_m3)
                    : 0;
            return sum + value;
        }, 0);

        const levelValues = tanques
            .map((tank) => (Number.isFinite(Number(tank.valor_m)) ? Number(tank.valor_m) : null))
            .filter((value) => value !== null);

        const computed = tanques.map((tank) => {
            const pct = calculateDisplayPorcentaje(tank);
            return { tank, pct };
        });

        const criticalCount = computed.filter((t) => Number.isFinite(Number(t.pct)) && Number(t.pct) < 20).length;
        const attentionCount = computed.filter((t) => Number.isFinite(Number(t.pct)) && Number(t.pct) >= 20 && Number(t.pct) < 40).length;

        return {
            production: totalFlow || null,
            monitored: tanques.length,
            averageLevel: levelValues.length ? levelValues.reduce((sum, value) => sum + value, 0) / levelValues.length : null,
            connection: error ? "Degradado" : "Conectado",
            status: computed.some((t) => Number.isFinite(Number(t.pct)) && Number(t.pct) < 20)
                ? "Crítico"
                : computed.some((t) => Number.isFinite(Number(t.pct)) && Number(t.pct) < 40)
                    ? "Atención"
                    : computed.some((t) => Number.isFinite(Number(t.pct)) && Number(t.pct) < 95)
                        ? "Llenándose"
                        : "Normal",
            criticalCount,
            attentionCount,
        };
    }, [tanques, error]);

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#F7F9FC", p: { xs: 1.5, md: 2 } }}>
            <Box sx={{ maxWidth: 1560, mx: "auto", display: "grid", gap: 2 }}>
                <Paper sx={{ minHeight: 140, p: { xs: 2.5, md: 3 }, borderRadius: "22px", bgcolor: "#FFFFFF", border: "1px solid #E8EEF5", boxShadow: "0 16px 45px rgba(15, 23, 42, 0.08)" }}>
                    <Box sx={{ display: "grid", gap: 2 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#0F2A55", textTransform: "uppercase", fontFamily: "Inter, sans-serif" }}>
                                Resumen general
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: systemSummary.connection === "Degradado" ? "#D32F2F" : "#2E7D32" }} />
                                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#0F2A55", fontFamily: "Inter, sans-serif" }}>{systemSummary.connection}</Typography>
                                </Box>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: systemSummary.status === "Crítico" ? "#D32F2F" : systemSummary.status === "Atención" ? "#F59E0B" : "#2E7D32" }} />
                                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#0F2A55", fontFamily: "Inter, sans-serif" }}>{systemSummary.status}</Typography>
                                </Box>
                            </Box>
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" }, gap: 1, alignItems: "center" }}>
                            {[
                                {
                                    label: "Producción total",
                                    value: systemSummary.production !== null ? `${systemSummary.production.toFixed(0)} m³` : "N/A",
                                    icon: <OpacityIcon sx={{ color: "#1565C0", fontSize: 20 }} />,
                                },
                                {
                                    label: "Tanques monitoreados",
                                    value: systemSummary.monitored,
                                    icon: <StorageIcon sx={{ color: "#1565C0", fontSize: 20 }} />,
                                },
                                {
                                    label: "Tanques críticos",
                                    value: systemSummary.criticalCount,
                                    icon: <WarningAmberIcon sx={{ color: "#D32F2F", fontSize: 20 }} />,
                                },
                                {
                                    label: "Tanques en atención",
                                    value: systemSummary.attentionCount,
                                    icon: <PriorityHighIcon sx={{ color: "#F59E0B", fontSize: 20 }} />,
                                },
                                {
                                    label: "Comunicación",
                                    value: systemSummary.connection,
                                    icon: <WifiIcon sx={{ color: systemSummary.connection === "Degradado" ? "#D32F2F" : "#2E7D32", fontSize: 20 }} />,
                                },
                                {
                                    label: "Hora actual",
                                    value: currentTime.toLocaleTimeString(),
                                    icon: <AccessTimeRoundedIcon sx={{ color: "#1565C0", fontSize: 20 }} />,
                                },
                            ].map((item, index) => (
                                <Box
                                    key={item.label}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        px: 2,
                                        py: 1,
                                        borderLeft: index === 0 ? "0" : "1px solid #E6EEF7",
                                        minHeight: 76,
                                    }}
                                >
                                    <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(21, 101, 192, 0.08)", display: "grid", placeItems: "center" }}>
                                        {item.icon}
                                    </Box>
                                    <Box sx={{ display: "grid", gap: 0.25 }}>
                                        <Typography sx={{ fontSize: 10, color: "#64748B", fontWeight: 700, textTransform: "uppercase", fontFamily: "Inter, sans-serif" }}>{item.label}</Typography>
                                        <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#0F2A55", fontFamily: "Inter, sans-serif" }}>{item.value}</Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Paper>

                {loading ? (
                    <Box sx={{ py: 10, display: "grid", placeItems: "center" }}>
                        <CircularProgress sx={{ color: "#1565C0" }} />
                    </Box>
                ) : error ? (
                    <Alert severity="error">{error}</Alert>
                ) : (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(1, minmax(0, 1fr))", md: "repeat(3, minmax(260px, 1fr))", xl: "repeat(5, minmax(260px, 1fr))" }, gap: 2, mt: 1.5, justifyItems: "center" }}>
                        {tanques.map((tanque, index) => {
                            const fallbackKey = normalizeText(tanque.nombre ?? tanque.display_name ?? tanque.tag ?? "") || `tanque-${index}`;
                            return <TanqueCard key={tanque.id ?? fallbackKey} tanque={tanque} />;
                        })}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
