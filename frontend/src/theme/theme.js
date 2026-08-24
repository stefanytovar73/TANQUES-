import { createTheme } from "@mui/material/styles";

const theme = createTheme({
    palette: {
        primary: {
            main: "#0A3568",
            light: "#195B99",
        },
        secondary: {
            main: "#F5A623",
        },
        success: {
            main: "#2DBE60",
        },
        error: {
            main: "#D32F2F",
        },
        background: {
            default: "#FFFFFF",
            paper: "#FFFFFF",
        },
    },

    typography: {
        fontFamily: "Roboto, Arial, sans-serif",
        h4: { fontWeight: 700 },
        h5: { fontWeight: 600 },
        button: { textTransform: "none", fontWeight: 600 },
    },

    shape: { borderRadius: 14 },

    components: {
        MuiPaper: {
            styleOverrides: {
                root: { boxShadow: '0 1px 6px rgba(10,35,104,0.06)', borderRadius: 14 },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: { boxShadow: '0 1px 8px rgba(10,35,104,0.04)', borderRadius: 14 },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: { borderRadius: 12 },
            },
        },
    },
});

export default theme;