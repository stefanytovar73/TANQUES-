import { Box, Typography } from "@mui/material";
import DistrictMap from "../../components/distritos/DistrictMap";
// Import telemetry boot to trigger PTAP as early as module load (no UI change)
import '../../services/telemetryBoot';

export default function Distritos() {
    return (
        <Box sx={{ minHeight: "70vh", display: "block", p: 1 }} data-testid="page-distritos-root">
            <Typography variant="h4" sx={{ fontWeight: 800, color: "#1B2A41", mb: 2 }}>
                Distritos
            </Typography>

            <DistrictMap />
        </Box>
    );
}
