import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, CircularProgress, Alert, Paper, Button, Tooltip } from "@mui/material";
import OpacityIcon from "@mui/icons-material/Opacity";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import WifiIcon from "@mui/icons-material/Wifi";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import SortableTanqueCard from "../../components/dashboard/SortableTanqueCard";
import TanqueCard from "../../components/dashboard/TanqueCard";
import tanqueService from "../../services/tanqueService";
import { loadCatalog, mergeApiTanquesWithCatalog, normalizeText, calculateDisplayPorcentaje } from "../../config/tankCatalog";

// Clave donde se guarda el orden personalizado de los tanques
const ORDER_STORAGE_KEY = "ibal-tanques:tankOrder";

/**
 * Obtiene la clave única de un tanque para identificarlo de forma estable.
 */
const getTanqueKey = (tanque, index) =>
  tanque.id != null
    ? String(tanque.id)
    : normalizeText(tanque.nombre ?? tanque.display_name ?? tanque.tag ?? "") || `tanque-${index}`;

/**
 * Lee el orden guardado en localStorage. Devuelve [] si no hay nada.
 */
const loadSavedOrder = () => {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Guarda el array de claves de orden en localStorage.
 */
const saveOrder = (keys) => {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(keys));
  } catch (err) {
    console.warn("No se pudo guardar el orden de tanques:", err);
  }
};

/**
 * Aplica el orden guardado a la lista de tanques.
 * Los tanques no presentes en el orden guardado van al final.
 */
const applyOrder = (tanques, savedOrder) => {
  if (!savedOrder.length) return tanques;
  const map = new Map(tanques.map((t, i) => [getTanqueKey(t, i), t]));
  const ordered = [];
  // Primero los que están en el orden guardado
  for (const key of savedOrder) {
    if (map.has(key)) {
      ordered.push(map.get(key));
      map.delete(key);
    }
  }
  // Luego los nuevos tanques que no estaban en el orden guardado
  for (const t of map.values()) {
    ordered.push(t);
  }
  return ordered;
};

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
  const [orderedTanques, setOrderedTanques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeId, setActiveId] = useState(null);

  // Guardamos el orden original de la API para poder restablecerlo
  const apiOrderRef = useRef([]);

  // Sensores: puntero (ratón) y toque (móvil). Activar drag solo tras 8px de movimiento
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const fetchTanques = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await tanqueService.getTanques(!showLoading);
      const catalog = loadCatalog();
      const merged = mergeApiTanquesWithCatalog(response.tanques || [], catalog);
      setTanques(merged);

      // Guardar orden "puro" de API (sin personalización)
      apiOrderRef.current = merged.map((t, i) => getTanqueKey(t, i));

      // Aplicar orden guardado si existe
      const savedOrder = loadSavedOrder();
      setOrderedTanques(applyOrder(merged, savedOrder));

      setError("");
    } catch (err) {
      console.error(err);
      if (showLoading) setError("No fue posible obtener la información de los tanques.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTanques();
    const interval = setInterval(() => fetchTanques(false), 60000);
    return () => clearInterval(interval);
  }, [fetchTanques]);

  // Cuando los tanques de la API se actualizan en background (polling),
  // actualizar datos pero preservar el orden personalizado del usuario
  useEffect(() => {
    if (!tanques.length) return;
    const savedOrder = loadSavedOrder();
    setOrderedTanques(applyOrder(tanques, savedOrder));
  }, [tanques]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Drag & Drop handlers ──────────────────────────────────────────────────

  const getSortableIds = () =>
    orderedTanques.map((t, i) => getTanqueKey(t, i));

  const handleDragStart = ({ active }) => {
    setActiveId(active.id);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    setOrderedTanques((prev) => {
      const ids = prev.map((t, i) => getTanqueKey(t, i));
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      // Guardar nuevo orden automáticamente
      saveOrder(reordered.map((t, i) => getTanqueKey(t, i)));
      return reordered;
    });
  };

  const handleResetOrder = () => {
    try {
      localStorage.removeItem(ORDER_STORAGE_KEY);
    } catch {}
    setOrderedTanques(applyOrder(tanques, []));
  };

  // Tanque activo (el que se está arrastrando) para el DragOverlay
  const activeTanque = useMemo(() => {
    if (!activeId) return null;
    return orderedTanques.find((t, i) => getTanqueKey(t, i) === activeId) ?? null;
  }, [activeId, orderedTanques]);

  // ─── Resumen del sistema ───────────────────────────────────────────────────
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

  const hasSavedOrder = loadSavedOrder().length > 0;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F7F9FC", p: { xs: 1.5, md: 2 } }}>
      <Box sx={{ maxWidth: 1560, mx: "auto", display: "grid", gap: 2 }}>

        {/* ── Panel de resumen ── */}
        <Paper sx={{ minHeight: 140, p: { xs: 2.5, md: 3 }, borderRadius: "22px", bgcolor: "#FFFFFF", border: "1px solid #E8EEF5", boxShadow: "0 16px 45px rgba(15, 23, 42, 0.08)" }}>
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#0F2A55", textTransform: "uppercase", fontFamily: "Inter, sans-serif" }}>
                Resumen general
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: systemSummary.connection === "Degradado" ? "#D32F2F" : "#2E7D32" }} />
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#0F2A55", fontFamily: "Inter, sans-serif" }}>{systemSummary.connection}</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: systemSummary.status === "Crítico" ? "#D32F2F" : systemSummary.status === "Atención" ? "#F59E0B" : "#2E7D32" }} />
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#0F2A55", fontFamily: "Inter, sans-serif" }}>{systemSummary.status}</Typography>
                </Box>
                {/* Botón restablecer orden */}
                {hasSavedOrder && (
                  <Tooltip title="Volver al orden original de la API">
                    <Button
                      size="small"
                      startIcon={<RestartAltIcon />}
                      onClick={handleResetOrder}
                      sx={{
                        fontSize: 11,
                        textTransform: "none",
                        color: "#64748B",
                        borderColor: "#CBD5E1",
                        "&:hover": { borderColor: "#94A3B8", bgcolor: "#F1F5F9" },
                        border: "1px solid #CBD5E1",
                        borderRadius: "8px",
                        px: 1.5,
                        py: 0.4,
                      }}
                    >
                      Restablecer orden
                    </Button>
                  </Tooltip>
                )}
              </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" }, gap: 1, alignItems: "center" }}>
              {[
                { label: "Producción total", value: systemSummary.production !== null ? `${systemSummary.production.toFixed(0)} m³` : "N/A", icon: <OpacityIcon sx={{ color: "#1565C0", fontSize: 20 }} /> },
                { label: "Tanques monitoreados", value: systemSummary.monitored, icon: <StorageIcon sx={{ color: "#1565C0", fontSize: 20 }} /> },
                { label: "Tanques críticos", value: systemSummary.criticalCount, icon: <WarningAmberIcon sx={{ color: "#D32F2F", fontSize: 20 }} /> },
                { label: "Tanques en atención", value: systemSummary.attentionCount, icon: <PriorityHighIcon sx={{ color: "#F59E0B", fontSize: 20 }} /> },
                { label: "Comunicación", value: systemSummary.connection, icon: <WifiIcon sx={{ color: systemSummary.connection === "Degradado" ? "#D32F2F" : "#2E7D32", fontSize: 20 }} /> },
                { label: "Hora actual", value: currentTime.toLocaleTimeString(), icon: <AccessTimeRoundedIcon sx={{ color: "#1565C0", fontSize: 20 }} /> },
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

        {/* ── Hint de arrastre ── */}
        {!loading && !error && orderedTanques.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 0.5 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 5px)", gap: "2px" }}>
              {[...Array(6)].map((_, i) => (
                <Box key={i} sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#94A3B8" }} />
              ))}
            </Box>
            <Typography sx={{ fontSize: 11, color: "#94A3B8", fontFamily: "Inter, sans-serif" }}>
              Arrastra las tarjetas para reorganizarlas — el orden se guarda automáticamente
            </Typography>
          </Box>
        )}

        {/* ── Grid de tarjetas con DnD ── */}
        {loading ? (
          <Box sx={{ py: 10, display: "grid", placeItems: "center" }}>
            <CircularProgress sx={{ color: "#1565C0" }} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={getSortableIds()} strategy={rectSortingStrategy}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(1, minmax(0, 1fr))",
                    md: "repeat(3, minmax(260px, 1fr))",
                    xl: "repeat(5, minmax(260px, 1fr))",
                  },
                  gap: 2,
                  mt: 0.5,
                  justifyItems: "center",
                }}
              >
                {orderedTanques.map((tanque, index) => {
                  const id = getTanqueKey(tanque, index);
                  return <SortableTanqueCard key={id} id={id} tanque={tanque} />;
                })}
              </Box>
            </SortableContext>

            {/* Overlay: sombra de la tarjeta mientras se arrastra */}
            <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
              {activeTanque ? (
                <Box sx={{ opacity: 0.85, transform: "scale(1.04)", boxShadow: "0 24px 48px rgba(15,42,85,0.22)", borderRadius: "18px" }}>
                  <TanqueCard tanque={activeTanque} />
                </Box>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </Box>
    </Box>
  );
}
