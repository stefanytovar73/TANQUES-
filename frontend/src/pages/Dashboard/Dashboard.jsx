import { useEffect, useState } from "react";
import { Box, Typography, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, Chip, Stack } from "@mui/material";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import dayjs from "dayjs";

import TankConfigDialog from "../../components/dashboard/TankConfigDialog";
import tanqueService from "../../services/tanqueService";
import { loadCatalog, saveCatalog, mergeApiTanquesWithCatalog, updateCatalogEntry, normalizeText, calculateDisplayPorcentaje } from "../../config/tankCatalog";

const STORAGE_KEY = "ibal-tanques:lastValidTanques";
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1500;
const ALERTA_PERDIDA_IBAL = "ALERTA: pérdida de conexión con la fuente de datos IBAL";

function ConfiguracionTanquesSection({ tanques, onEditConfig }) {
    const formatPct = (tanque) => {
        const pct = calculateDisplayPorcentaje(tanque);
        return pct != null ? `${pct} %` : "N/A";
    };
    return (
        <Box sx={{ mt: 6 }}>
            <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, mb: 3 }}>
                <Box>
                    <Typography sx={{ fontSize: 18, fontWeight: 800, color: "#1B2A41" }}>Configuración de Tanques</Typography>
                    <Typography sx={{ color: "#475569", fontSize: 13, mt: 0.5 }}>Datos físicos centralizados y porcentaje calculado a partir del nivel actual.</Typography>
                </Box>
            </Box>

            <TableContainer component={Paper} sx={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)", borderRadius: 3, overflow: "hidden" }}>
                <Table sx={{ minWidth: 700 }}>
                    <TableHead sx={{ backgroundColor: "#F1F5F9" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Nombre del tanque</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Nivel actual</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Altura de rebose</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Área del tanque</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Capacidad máxima</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Porcentaje</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Acción</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tanques.map((tanque, index) => (
                            <TableRow key={tanque.id ?? tanque.tag ?? `${tanque.nombre}-${index}`}>
                                <TableCell>{tanque.display_name ?? tanque.nombre ?? tanque.tag ?? "-"}</TableCell>
                                <TableCell>{Number.isFinite(Number(tanque.valor_m)) ? `${Number(tanque.valor_m).toFixed(3)} m` : "N/A"}</TableCell>
                                <TableCell>{Number.isFinite(Number(tanque.altura_rebose)) ? `${Number(tanque.altura_rebose).toFixed(2)} m` : "N/A"}</TableCell>
                                <TableCell>{Number.isFinite(Number(tanque.area_m2)) ? `${Number(tanque.area_m2).toFixed(2)} m²` : "N/A"}</TableCell>
                                <TableCell>{Number.isFinite(Number(tanque.capacidad_maxima_m3)) ? `${Number(tanque.capacidad_maxima_m3).toFixed(2)} m³` : "N/A"}</TableCell>
                                <TableCell>{formatPct(tanque)}</TableCell>
                                <TableCell>
                                    <Button variant="outlined" size="small" onClick={() => onEditConfig?.(tanque)}>
                                        Editar
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

function Dashboard() {
    const [tanques, setTanques] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [selectedTankConfig, setSelectedTankConfig] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastCachedAt, setLastCachedAt] = useState(null);

    const loadCachedTanques = () => {
        return false;
    };

    const loadCatalogFromStorage = () => {
        const loaded = loadCatalog();
        setCatalog(loaded);
        return loaded;
    };

    const saveCachedTanques = (tanquesToSave) => {
        const sanitized = (tanquesToSave || []).map((t) => {
            const copy = { ...t };
            ["porcentaje", "porcentaje_capacidad", "porcentaje_api", "porcentaje_capacidad_api", "pct"].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(copy, key)) delete copy[key];
            });
            return copy;
        });
        const payload = { tanques: sanitized, timestamp: Date.now() };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            setLastCachedAt(payload.timestamp);
        } catch (err) {
            console.warn("No se pudo guardar cache local de tanques", err);
        }
    };

    const getCachedAtLabel = () => (lastCachedAt ? dayjs(lastCachedAt).format("DD/MM/YYYY HH:mm:ss") : null);

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setSelectedTankConfig(null);
    };

    const handleSaveConfig = (updates) => {
        if (!selectedTankConfig) return;
        const id = normalizeText(selectedTankConfig.display_name ?? selectedTankConfig.nombre ?? selectedTankConfig.tag ?? selectedTankConfig.id ?? "");
        const updatedCatalog = updateCatalogEntry(catalog, id, {
            ...selectedTankConfig,
            ...updates,
        });
        saveCatalog(updatedCatalog);
        // Re-read catalog from storage to ensure persistence and normalized structure
        const reloaded = loadCatalogFromStorage();
        setCatalog(reloaded);

        const merged = mergeApiTanquesWithCatalog(tanques, reloaded);
        setTanques(merged);
        saveCachedTanques(merged);
        setDialogOpen(false);
        setSelectedTankConfig(null);
    };

    const reportTankNames = [
        "Alsacia",
        "Ambala 1",
        "Ambala 2",
        "La Aurora",
        "Cerro Gordo 1",
        "Cerro Gordo 2",
        "Ciudad",
        "Interlaken",
        "Mirolindo",
        "Picaleña 1",
        "Picaleña 2",
        "Piedra Pintada 1",
        "Piedra Pintada 2",
    ];

    const WATCHLIST_CALIBRACION = ["Calucaima", "Interlaken", "La 15", "La 29", "La 30", "Miramar"];

    const persistCalibrationHistory = (list) => {
        try {
            const rows = list
                .filter(Boolean)
                .map((t) => {
                    const tankName = t.display_name ?? t.nombre ?? t.tag ?? t.id;
                    const nivelSensor = Number.isFinite(Number(t.valor_m)) ? Number(t.valor_m) : null;
                    const porcentajeIbal = Number.isFinite(Number(t.porcentaje)) ? Number(t.porcentaje) : (Number.isFinite(Number(t.porcentaje_api)) ? Number(t.porcentaje_api) : null);
                    const porcentajeCalculado = calculateDisplayPorcentaje(t) == null ? null : Number(calculateDisplayPorcentaje(t));

                    if (nivelSensor == null || (porcentajeIbal == null && porcentajeCalculado == null)) {
                        return null;
                    }

                    return {
                        fecha_hora: new Date().toISOString(),
                        tanque: tankName,
                        nivel_sensor: nivelSensor,
                        porcentaje_calculado: porcentajeCalculado,
                        porcentaje_ibal: porcentajeIbal,
                    };
                })
                .filter(Boolean);

            if (!rows.length) return;

            const existing = JSON.parse(localStorage.getItem("ibal-tanques:calibrationHistory") || "[]");
            const nextHistory = [...existing, ...rows].slice(-400);
            localStorage.setItem("ibal-tanques:calibrationHistory", JSON.stringify(nextHistory));
        } catch (err) {
            console.warn("No se pudo guardar el histórico de calibración:", err);
        }
    };

    const logDiagnostics = (list) => {
        try {
                    const rows = list
                .filter(Boolean)
                .map((t) => {
                    return {
                        tanque: t.display_name ?? t.nombre ?? t.tag ?? t.id,
                        valor_m: Number.isFinite(Number(t.valor_m)) ? Number(t.valor_m) : null,
                        porcentaje_api: Number.isFinite(Number(t.porcentaje)) ? Number(t.porcentaje) : (Number.isFinite(Number(t.porcentaje_api)) ? Number(t.porcentaje_api) : null),
                        porcentaje_calculado: calculateDisplayPorcentaje(t) == null ? null : Number(calculateDisplayPorcentaje(t)),
                    };
                });
            console.group("Diagnóstico porcentajes IBAL vs cálculo frontend");
            console.table(rows);
            console.groupEnd();
        } catch (err) {
            console.warn("Error al generar diagnóstico de tanques:", err);
        }
    };

    const fetchTanques = async (attempt = 0) => {
        try {
            const response = await tanqueService.getTanques();
            const serverTanques = Array.isArray(response?.tanques) ? response.tanques : [];
            const apiStatus = response?.status ?? "ok";

            if (apiStatus === "error" || apiStatus === "invalid" || serverTanques.length === 0) {
                try {
                    localStorage.removeItem(STORAGE_KEY);
                } catch (err) {
                    console.warn("No se pudo limpiar la caché local del dashboard", err);
                }
                setTanques([]);
                setError(ALERTA_PERDIDA_IBAL);
                setLoading(false);
                if (attempt < MAX_RETRIES) {
                    window.setTimeout(() => fetchTanques(attempt + 1), BASE_RETRY_DELAY_MS * (attempt + 1));
                }
                return;
            }

            setTanques(serverTanques);
            saveCachedTanques(serverTanques);
            const toReport = serverTanques.filter((t) => reportTankNames.includes(t.display_name ?? t.nombre));
            logDiagnostics(toReport);
            const calibrationWatch = serverTanques.filter((t) => WATCHLIST_CALIBRACION.includes(t.display_name ?? t.nombre));
            persistCalibrationHistory(calibrationWatch);
            setError("");
            setLoading(false);
        } catch (err) {
            console.error("Error al obtener tanques:", err);
            setTanques([]);
            setError(ALERTA_PERDIDA_IBAL);
            setLoading(false);
            if (attempt < MAX_RETRIES) {
                window.setTimeout(() => fetchTanques(attempt + 1), BASE_RETRY_DELAY_MS * (attempt + 1));
            }
        }
    };

    useEffect(() => {
        loadCatalogFromStorage();
        setLoading(true);
        setError("");
        fetchTanques();
    }, []);

    // Poll API periodically so UI recalculates percentages whenever `valor_m` updates
    useEffect(() => {
        const POLL_MS = 60000; // align with IBAL API refresh guidance
        const id = window.setInterval(async () => {
            try {
                const resp = await tanqueService.getTanques(true);
                const serverTanques = resp?.tanques ?? [];
                setTanques(serverTanques);
                saveCachedTanques(serverTanques);
                const toReport = serverTanques.filter((t) => reportTankNames.includes(t.display_name ?? t.nombre));
                logDiagnostics(toReport);
            } catch (err) {
                // polling errors are non-fatal; keep existing state
            }
        }, POLL_MS);
        return () => clearInterval(id);
    }, [catalog]);
    

    const mergedTanques = mergeApiTanquesWithCatalog(tanques, catalog);
    const cachedLabel = getCachedAtLabel();

    return (
        <Box sx={{ minHeight: "100vh", background: "#F7F9FC", color: "#1B2A41", px: { xs: 2, md: 4 }, py: 4, fontFamily: "Inter, sans-serif" }}>
            <Box sx={{ maxWidth: 1440, mx: "auto" }}>
                <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, mb: 4, borderRadius: 4, color: "#fff", background: "linear-gradient(105deg, #0d2f5b 0%, #17649b 100%)", position: "relative", overflow: "hidden" }}>
                    <Box sx={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", border: "35px solid rgba(255,255,255,.06)", right: -45, top: -100 }} />
                    <Box sx={{ display: "flex", alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Box sx={{ width: 52, height: 52, borderRadius: "50%", bgcolor: "rgba(255,255,255,.14)", display: "grid", placeItems: "center" }}>
                                <WaterDropRoundedIcon sx={{ color: "#f4b83f", fontSize: 28 }} />
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 900 }}>Configuración de Tanques</Typography>
                                <Typography sx={{ color: "rgba(255,255,255,.75)", mt: 0.5 }}>Ajusta y administra los parámetros físicos de cada tanque desde un único catálogo.</Typography>
                            </Box>
                        </Box>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                            <Chip icon={<AccessTimeRoundedIcon />} label={dayjs().format("DD/MM/YYYY · HH:mm:ss")} sx={{ color: "#fff", bgcolor: "rgba(255,255,255,.12)" }} />
                            <Chip label="Administrador IBAL" sx={{ color: "#fff", bgcolor: "rgba(255,255,255,.12)" }} />
                        </Stack>
                    </Box>
                </Paper>
                <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 2, mb: 3 }}>
                    {cachedLabel && (
                        <Typography sx={{ fontSize: 12, color: "#64748B" }}>Datos guardados: {cachedLabel}</Typography>
                    )}
                </Box>

                {error && (
                    <Alert severity={mergedTanques.length > 0 ? "warning" : "error"} sx={{ background: "#FFFFFF", border: "1px solid #E4E8EF", boxShadow: "0 12px 24px rgba(15,23,42,0.05)", color: "#1B2A41", mb: 3 }}>
                        {error}
                    </Alert>
                )}

                {loading && !mergedTanques.length ? (
                    <Box sx={{ py: 16, display: "grid", placeItems: "center" }}>
                        <CircularProgress sx={{ color: "#1565C0" }} />
                    </Box>
                ) : (
                    <ConfiguracionTanquesSection
                        tanques={mergedTanques}
                        onEditConfig={(tank) => {
                            const matched = normalizeText(tank.display_name ?? tank.nombre ?? tank.tag ?? "");
                            const selected = mergedTanques.find((item) => normalizeText(item.display_name ?? item.nombre ?? item.tag ?? "") === matched);
                            setSelectedTankConfig(selected || tank);
                            setDialogOpen(true);
                        }}
                    />
                )}

                <TankConfigDialog
                    open={dialogOpen}
                    onClose={handleCloseDialog}
                    catalogEntry={selectedTankConfig}
                    onSave={handleSaveConfig}
                />
            </Box>
        </Box>
    );
}

export default Dashboard;
