import { Box, Divider, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, IconButton } from "@mui/material";
import { Home, Water, Map, Monitor, History, Assessment, Settings, ChevronLeft, ChevronRight } from "@mui/icons-material";
import { NavLink } from "react-router-dom";

const menuItems = [
  { to: '/', label: 'Inicio', icon: <Home /> },
  { to: '/tanques', label: 'Tanques', icon: <Water /> },
  { to: '/distritos', label: 'Distritos', icon: <Map /> },
  { to: '/monitoreo', label: 'Monitoreo', icon: <Monitor /> },
  { to: '/historicos', label: 'Históricos', icon: <History /> },
  { to: '/reportes', label: 'Reportes', icon: <Assessment /> },
  { to: '/configuracion', label: 'Configuración', icon: <Settings /> },
];

function Sidebar({ onNavigate, sx, collapsed = false, onToggleCollapse }) {
  const stripeWidth = 4;
  // When collapsed, render only a narrow yellow stripe; clicking anywhere toggles
  if (collapsed) {
    return (
      <Box onClick={onToggleCollapse} sx={{ width: stripeWidth, bgcolor: '#f4b83f', height: '100%', position: 'relative', cursor: 'pointer', ...sx }} role="button" tabIndex={0}>
        {/* small visual indicator inside the stripe near the Configuración area */}
        <Box sx={{ position: 'absolute', bottom: 88, left: '50%', transform: 'translateX(-50%)', color: '#073B70', opacity: 0.95 }}>
          <ChevronRight fontSize="small" />
        </Box>
      </Box>
    );
  }

  // Expanded sidebar (original look) — keep exactly as before but make the yellow stripe clickable
  return (
    <Box sx={{ width: 260, bgcolor: '#073B70', color: 'common.white', height: '100%', borderRight: `${stripeWidth}px solid #f4b83f`, position: 'relative', ...sx }} role="presentation">
      <Toolbar sx={{ minHeight: 92, px: 3, alignItems: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#f4b83f', display: 'grid', placeItems: 'center', mr: 1.5 }}>
          <Typography sx={{ color: '#073B70', fontWeight: 900, fontSize: 16 }}>IB</Typography>
        </Box>
        <Box>
          <Typography sx={{ color: '#fff', fontWeight: 900, lineHeight: 1.05, letterSpacing: 0.8, fontSize: 16 }}>IBAL - IBAGUÉ</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 0.3 }}>Intranet Corporativo</Typography>
        </Box>
      </Toolbar>
      <Box sx={{ px: 2, py: 1 }}><Typography variant="caption" sx={{ color: '#fff', fontWeight: 800, letterSpacing: 1.2, fontSize: 13 }}>MENÚ PRINCIPAL</Typography></Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <List>
        {menuItems.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={onNavigate}
            sx={{
              color: 'rgba(255,255,255,0.92)',
              minHeight: 48,
              mx: 1.25,
              my: 0.55,
              borderRadius: 2,
              transition: 'all .2s ease',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', color: '#fff', transform: 'translateX(3px)' },
              '&.active': { bgcolor: '#f4b83f', color: '#073B70', boxShadow: '0 8px 20px rgba(244,184,63,0.18)' },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 42 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={<Typography sx={{ fontWeight: 700, fontSize: 14 }}>{item.label}</Typography>} />
          </ListItemButton>
        ))}
      </List>

      {/* Clickable yellow stripe overlay (right edge) - full height, small indicator near Configuración */}
      <Box onClick={(e) => { e.stopPropagation(); onToggleCollapse && onToggleCollapse(); }} sx={{ position: 'absolute', top: 0, right: 0, width: stripeWidth, height: '100%', bgcolor: '#f4b83f', cursor: 'pointer', zIndex: 20 }} role="button" aria-label="Colapsar menú">
        <Box sx={{ position: 'absolute', bottom: 88, left: '50%', transform: 'translateX(-50%)', color: '#073B70', opacity: 0.95 }}>
          <ChevronLeft fontSize="small" />
        </Box>
      </Box>
    </Box>
  );
}

export default Sidebar;
