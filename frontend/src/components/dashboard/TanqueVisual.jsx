import { Box, Typography } from "@mui/material";

export default function TanqueVisual({ porcentaje }) {
    const porcentajeValue = Number.isFinite(Number(porcentaje)) ? Math.max(0, Math.min(100, Number(porcentaje))) : null;

    const showInside = porcentajeValue != null && porcentajeValue >= 8; // threshold to render text inside water

    return (
        <Box sx={{ width: 180, height: 214, position: "relative", display: "grid", placeItems: "center" }}>
            <Box
                sx={{
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
                }}
            />
            <Box
                sx={{
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
                }}
            >
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.1) 22%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0) 70%)",
                        pointerEvents: "none",
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        left: 12,
                        top: 18,
                        width: 4,
                        height: "58%",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.45)",
                        opacity: 0.92,
                        pointerEvents: "none",
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        right: 12,
                        top: 18,
                        width: 4,
                        height: "56%",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.22)",
                        opacity: 0.9,
                        pointerEvents: "none",
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        right: 10,
                        top: 20,
                        display: "grid",
                        gap: 8,
                        justifyItems: "end",
                        height: "calc(100% - 40px)",
                        pointerEvents: "none",
                    }}
                >
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Box key={index} sx={{ width: 16, height: 2, borderRadius: 1, bgcolor: "rgba(15,23,42,0.16)" }} />
                    ))}
                </Box>
                <Box
                    sx={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${porcentajeValue != null ? porcentajeValue : 0}%`,
                        transition: "height 0.7s ease",
                        background: "linear-gradient(180deg, #3A7BE0 0%, #7DB4FF 42%, #D8EEFF 100%)",
                        display: "grid",
                        placeItems: "center",
                        overflow: "hidden",
                        boxShadow: "inset 0 10px 18px rgba(10,46,100,0.2)",
                    }}
                >
                    <Box
                        sx={{
                            position: "absolute",
                            top: 8,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "72%",
                            height: 10,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.24)",
                            opacity: 0.95,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            top: "24%",
                            left: "10%",
                            width: "20%",
                            height: 4,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.22)",
                            opacity: 0.9,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            top: "35%",
                            right: "12%",
                            width: "24%",
                            height: 3,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.18)",
                            opacity: 0.88,
                        }}
                    />
                </Box>
                <Typography
                    sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '100%',
                        textAlign: 'center',
                        fontSize: 20,
                        fontWeight: 900,
                        color: showInside ? '#FFFFFF' : '#0F2A55',
                        textShadow: showInside ? '0 0 12px rgba(0,0,0,0.18)' : 'none',
                        zIndex: 5,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {porcentajeValue == null ? 'Sin datos' : `${Math.round(porcentajeValue)}%`}
                </Typography>
            </Box>
            <Box
                sx={{
                    position: "absolute",
                    bottom: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 180,
                    height: 20,
                    borderRadius: "12px",
                    background: "linear-gradient(180deg, #BDC6D0 0%, #E8EDF4 100%)",
                    border: "1px solid rgba(112,120,128,0.22)",
                    boxShadow: "0 -4px 10px rgba(15,23,42,0.08)",
                }}
            />
        </Box>
    );
}
