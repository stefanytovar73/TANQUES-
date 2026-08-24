import React from "react";
import { IconButton, Badge, Menu, MenuItem, ListItemText, Typography } from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import dayjs from "dayjs";

const mock = [
  { id: 1, title: 'Alerta nivel alto - Tanque A', time: dayjs().subtract(10, 'minute') },
  { id: 2, title: 'Tanque B fuera de servicio', time: dayjs().subtract(1, 'hour') },
  { id: 3, title: 'Lectura recibida - Tanque C', time: dayjs().subtract(3, 'hour') },
];

function Notifications() {
  const [anchorEl, setAnchorEl] = React.useState(null);

  const open = Boolean(anchorEl);
  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} sx={{ ml: 1 }} aria-controls={open ? 'notif-menu' : undefined} aria-haspopup="true">
        <Badge badgeContent={mock.length} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Menu id="notif-menu" anchorEl={anchorEl} open={open} onClose={handleClose} PaperProps={{ sx: { width: 320 } }}>
        <Typography variant="subtitle1" sx={{ px: 2, pt: 1 }}>Notificaciones</Typography>
        {mock.map((n) => (
          <MenuItem key={n.id} onClick={handleClose}>
            <ListItemText primary={n.title} secondary={n.time.format('DD/MM/YYYY HH:mm')} />
          </MenuItem>
        ))}
        {mock.length === 0 && <MenuItem disabled>No hay notificaciones</MenuItem>}
      </Menu>
    </>
  );
}

export default Notifications;
