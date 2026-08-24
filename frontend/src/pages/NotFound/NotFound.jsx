import { Typography, Box } from "@mui/material";

function NotFound() {
  return (
    <Box sx={{ textAlign: "center", mt: 8 }}>
      <Typography variant="h3" gutterBottom>
        404
      </Typography>
      <Typography variant="h6">
        Página no encontrada.
      </Typography>
    </Box>
  );
}

export default NotFound;
