import React from 'react';
import { Box, IconButton } from '@mui/material';
import ZoomIn from '@mui/icons-material/ZoomIn';
import ZoomOut from '@mui/icons-material/ZoomOut';
import FitScreen from '@mui/icons-material/FitScreen';

export default function DistrictToolbar({ onZoomIn, onZoomOut, onFit }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <IconButton size="small" onClick={onZoomIn}><ZoomIn /></IconButton>
      <IconButton size="small" onClick={onZoomOut}><ZoomOut /></IconButton>
      <IconButton size="small" onClick={onFit}><FitScreen /></IconButton>
    </Box>
  );
}
