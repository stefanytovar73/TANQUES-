import { Box, Typography } from "@mui/material";
import React, { useMemo } from "react";

export default function TanqueVisual({ porcentaje, tanque, manual_porcentaje, onManualPctChange }) {
    const porcentajeValue = Number.isFinite(Number(porcentaje)) ? Math.max(0, Math.min(100, Number(porcentaje))) : null;
    const manualPct = Number.isFinite(Number(manual_porcentaje)) ? Number(manual_porcentaje) : null;

    const showInside = porcentajeValue != null && porcentajeValue >= 8; // threshold to render text inside water

    const sxs = useMemo(() => ({
        container: { width: 180, height: 214, position: "relative", display: "grid", placeItems: "center" },
        topCapsule: {
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 180,
            height: 20,
            borderRadius: "12px",
            background: "linear-gradient(180deg, #E3E7EB 0%, #AAB4BC 100%)",
            border: "1px solid rgba(112,120,128,0.26)",
            boxShadow: "0 4px 10px rgba(15,23,42,0.08)",
            zIndex: 4,
        },
        shell: {
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 168,
            height: 178,
            borderRadius: "20px",
            border: "2px solid rgba(112,120,128,0.4)",
            background: "rgba(250,252,255,0.92)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.8), inset 0 18px 28px rgba(255,255,255,0.55), 0 10px 26px rgba(15,23,42,0.06)",
            overflow: "hidden",
        },
        overlayGradient: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.1) 22%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0) 70%)", pointerEvents: "none" },
        leftStripe: { position: "absolute", left: 12, top: 18, width: 4, height: "58%", borderRadius: 999, background: "rgba(255,255,255,0.45)", opacity: 0.92, pointerEvents: "none" },
        rightStripe: { position: "absolute", right: 12, top: 18, width: 4, height: "56%", borderRadius: 999, background: "rgba(255,255,255,0.22)", opacity: 0.9, pointerEvents: "none" },
        dotsContainer: { position: "absolute", right: 10, top: 20, display: "grid", gap: 8, justifyItems: "end", height: "calc(100% - 40px)", pointerEvents: "none" },
        editWrapper: { position: 'absolute', right: 6, top: 8, zIndex: 8 },
        editButton: { width: 26, height: 26, borderRadius: '50%', bgcolor: '#1e40af', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 4px 8px rgba(15,23,42,0.12)', cursor: 'pointer' },
        waterBox: { position: "absolute", bottom: 0, left: 0, right: 0, height: `${porcentajeValue != null ? porcentajeValue : 0}%`, transition: "height 0.7s ease", background: "linear-gradient(180deg, #3A7BE0 0%, #7DB4FF 42%, #D8EEFF 100%)", display: "grid", placeItems: "center", overflow: "hidden", boxShadow: "inset 0 10px 18px rgba(10,46,100,0.2)" },
        waterInnerTop: { position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: "72%", height: 10, borderRadius: 999, background: "rgba(255,255,255,0.24)", opacity: 0.95 },
        waterInnerLeft: { position: "absolute", top: "24%", left: "10%", width: "20%", height: 4, borderRadius: 999, background: "rgba(255,255,255,0.22)", opacity: 0.9 },
        waterInnerRight: { position: "absolute", top: "35%", right: "12%", width: "24%", height: 3, borderRadius: 999, background: "rgba(255,255,255,0.18)", opacity: 0.88 },
        percentageText: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', textAlign: 'center', fontSize: 20, fontWeight: 900, color: showInside ? '#FFFFFF' : '#0F2A55', textShadow: showInside ? '0 0 12px rgba(0,0,0,0.18)' : 'none', zIndex: 5, pointerEvents: 'auto', cursor: 'pointer', whiteSpace: 'nowrap' },
        bottomCapsule: { position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 180, height: 20, borderRadius: "12px", background: "linear-gradient(180deg, #BDC6D0 0%, #E8EDF4 100%)", border: "1px solid rgba(112,120,128,0.22)", boxShadow: "0 -4px 10px rgba(15,23,42,0.08)" }
    }), [porcentajeValue, showInside]);

    return (
        <Box sx={sxs.container}>
            <Box sx={sxs.topCapsule} />
            <Box sx={sxs.shell}>
                <Box sx={sxs.overlayGradient} />
                <Box sx={sxs.leftStripe} />
                <Box sx={sxs.rightStripe} />
                <Box sx={sxs.dotsContainer}>
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Box key={index} sx={{ width: 16, height: 2, borderRadius: 1, bgcolor: "rgba(15,23,42,0.16)" }} />
                    ))}
                </Box>
                <Box sx={sxs.editWrapper}>
                    <Box onClick={(e) => { e.stopPropagation(); if (typeof onManualPctChange === 'function') onManualPctChange(tanque); }} sx={sxs.editButton}>
                        <Box component="span" sx={{ fontSize: 11, fontWeight: 800 }}>✎</Box>
                    </Box>
                </Box>
                <Box sx={sxs.waterBox}>
                    <Box sx={sxs.waterInnerTop} />
                    <Box sx={sxs.waterInnerLeft} />
                    <Box sx={sxs.waterInnerRight} />
                </Box>
                <Typography sx={sxs.percentageText} onClick={(e) => { e.stopPropagation(); if (typeof onManualPctChange === 'function') onManualPctChange(tanque); }}>
                    {porcentajeValue == null ? 'Sin datos' : `${Math.round(porcentajeValue)}%`}
                </Typography>
            </Box>
            <Box sx={sxs.bottomCapsule} />
        </Box>
    );
}
