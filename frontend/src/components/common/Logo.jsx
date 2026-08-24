import { Box, Typography } from "@mui/material";
import WaterDropIcon from '@mui/icons-material/Opacity';

function Logo({ small }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <WaterDropIcon sx={{ color: '#F5A623', fontSize: small ? 28 : 34 }} />
      <Typography variant={small ? 'subtitle2' : 'h6'} sx={{ ml: 1, fontWeight: 700, letterSpacing: 0.2 }}>
        IBAL
      </Typography>
    </Box>
  );
}

export default Logo;
