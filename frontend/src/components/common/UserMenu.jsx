import React from "react";
import { IconButton, Avatar, Menu, MenuItem, ListItemIcon, Typography } from "@mui/material";
import AccountCircle from '@mui/icons-material/AccountCircle';
import Settings from '@mui/icons-material/Settings';
import Logout from '@mui/icons-material/Logout';

function UserMenu() {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleLogout = () => {
    console.log('Cerrar sesión');
    handleClose();
  };

  return (
    <>
      <IconButton onClick={handleOpen} color="inherit" sx={{ ml: 1 }}>
        <Avatar alt="Usuario" src="" />
      </IconButton>

      <Menu anchorEl={anchorEl} open={open} onClose={handleClose} PaperProps={{ sx: { width: 200 } }}>
        <MenuItem onClick={handleClose}>
          <ListItemIcon>
            <AccountCircle fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2">Perfil</Typography>
        </MenuItem>

        <MenuItem onClick={handleClose}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2">Configuración</Typography>
        </MenuItem>

        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2">Cerrar sesión</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}

export default UserMenu;
