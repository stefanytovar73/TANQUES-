import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Box, CssBaseline, Drawer } from "@mui/material";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";

const drawerWidth = 260;
const collapsedWidth = 4; // narrow yellow stripe when collapsed (restored)

export default function MainLayout() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    const handleDrawerToggle = () => {
        setMobileOpen((prev) => !prev);
    };

    const headerToggle = () => {
        if (typeof window !== 'undefined' && window.innerWidth < 900) {
            // mobile: open temporary drawer
            setMobileOpen((prev) => !prev);
        } else {
            // desktop: toggle collapsed state
            setCollapsed((prev) => !prev);
        }
    };

    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: `${collapsed ? collapsedWidth : drawerWidth}px 1fr`, gridTemplateRows: '92px 1fr', minHeight: '100vh', bgcolor: '#f4f7fb', overflowX: 'hidden' }}>
            <CssBaseline />

            {/* Sidebar - occupies first column and both rows */}
            <Box component="nav" sx={{ gridColumn: '1', gridRow: '1 / 3', width: { md: drawerWidth }, flexShrink: { md: 0 } }} aria-label="sidebar">
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }}
                    sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
                >
                    <Sidebar onNavigate={handleDrawerToggle} />
                </Drawer>

                <Drawer
                    variant="permanent"
                    sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: collapsed ? collapsedWidth : drawerWidth, boxShadow: 'none' } }}
                    open
                >
                    <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
                </Drawer>
            </Box>

            {/* Header - top right */}
                <Box component="header" sx={{ gridColumn: '2', gridRow: '1' }}>
                <Header onOpenSidebar={headerToggle} />
            </Box>

            {/* Main content - below header */}
            <Box component="main" sx={{ gridColumn: '2', gridRow: '2', flex: '1 1 auto', width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
                <Box sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1900, mx: 'auto' }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
}