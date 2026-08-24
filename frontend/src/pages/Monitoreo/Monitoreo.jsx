import { Box, Typography } from "@mui/material";

export default function Monitoreo() {
    return (
        <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center", p: 4 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#1B2A41" }}>
                Monitoreo
            </Typography>
            <Typography sx={{ color: "#475569", mt: 2 }}>
                Aquí irá el contenido de la sección de monitoreo.
            </Typography>
        </Box>
    );
}
