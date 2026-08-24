import { useEffect, useState } from "react";
import { AppBar, Toolbar, IconButton, Box, InputBase, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import { styled, alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import Notifications from "../common/Notifications";
import UserMenu from "../common/UserMenu";

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: 'rgba(255,255,255,0.13)',
  '&:hover': { backgroundColor: 'rgba(255,255,255,0.18)' },
  marginLeft: 0,
  width: "100%",
  [theme.breakpoints.up("sm")]: { marginLeft: theme.spacing(1), width: "auto" },
  border: `1px solid ${alpha(theme.palette.common.white, 0.22)}`,
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.palette.primary.main,
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: theme.palette.common.white,
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
    [theme.breakpoints.up('md')]: { width: '28ch' },
  },
  '& .MuiInputBase-input::placeholder': {
    color: 'rgba(255,255,255,0.72)',
  },
}));

function Header({ onOpenSidebar }) {
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppBar position="static" elevation={0} sx={{ backgroundColor: '#073B70', borderRadius: { xs: 0, md: '0 0 12px 12px' }, boxShadow: '0 6px 22px rgba(7,59,112,0.12)', borderBottom: '3px solid #f4b83f' }}>
      <Toolbar sx={{ minHeight: { xs: 72, md: 92 }, px: { xs: 2, md: 4 }, gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <IconButton sx={{ color: '#fff' }} edge="start" onClick={onOpenSidebar}>
            <MenuIcon />
          </IconButton>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Search sx={{ borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase placeholder="Buscar…" inputProps={{ 'aria-label': 'search' }} />
        </Search>

        <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
          <Box sx={{ mr: { sm: 1, md: 2 }, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>{now.format('DD/MM/YYYY')}</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>{now.format('HH:mm:ss')}</Typography>
          </Box>
          <Notifications />
          <UserMenu />
          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700, display: { xs: 'none', lg: 'block' }, ml: 0.5 }}>Administrador</Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
