import { Card, CardContent, Typography, Box } from "@mui/material";
import TanqueVisual from "./TanqueVisual";
import { calculateDisplayPorcentaje } from "../../config/tankCatalog";

const getTankStatusColor = (porcentaje) => {
    if (!Number.isFinite(Number(porcentaje))) return "#9CA3AF";
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

function TanqueCard({ tanque, onManualPctChange }) {
    const displayName = tanque.display_name ?? tanque.nombre ?? tanque.tag ?? "Sin nombre";
    const porcentaje = calculateDisplayPorcentaje(tanque);
    const statusColor = getTankStatusColor(porcentaje);
    const statusLabel = getTankStatusLabel(porcentaje);
    const nivel = tanque.nivel ?? tanque.valor_m ?? tanque.valor ?? null;

    return (
        <Card
            sx={{
                width: "100%",
                maxWidth: 320,
                minHeight: 340,
                borderRadius: "18px",
                overflow: "hidden",
                background: "#FFFFFF",
                border: "1px solid #E8EDF5",
                boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
            }}
        >
            <CardContent sx={{ p: 3, display: "grid", gap: 1.5 }}>
                {/* Nombre del tanque */}
                <Typography
                    sx={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0F2A55",
                        fontFamily: "Inter, sans-serif",
                        lineHeight: 1.3,
                        textAlign: "center",
                    }}
                >
                    {displayName}
                </Typography>

                {/* Badge de estado */}
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: statusColor, boxShadow: `0 0 0 6px ${statusColor}22` }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: statusColor, textTransform: "uppercase", fontFamily: "Inter, sans-serif", letterSpacing: "0.08em" }}>
                        {statusLabel}
                    </Typography>
                </Box>

                {/* Visual del tanque */}
                <Box sx={{ display: "grid", placeItems: "center" }}>
                    <TanqueVisual porcentaje={porcentaje} tanque={tanque} manual_porcentaje={tanque.manual_porcentaje} onManualPctChange={onManualPctChange} />
                </Box>

                {/* Nivel actual */}
                <Box sx={{ display: "grid", gap: 0.5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "Inter, sans-serif" }}>
                        Nivel actual
                    </Typography>
                    <Typography sx={{ fontSize: 32, fontWeight: 900, color: "#0F2A55", fontFamily: "Inter, sans-serif" }}>
                        {Number.isFinite(Number(nivel)) ? `${Number(nivel).toFixed(2)} m` : "--"}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
}

export default TanqueCard;
