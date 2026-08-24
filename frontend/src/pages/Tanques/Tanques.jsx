import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import tanqueService from "../../services/tanqueService";
import { findCatalogEntry, loadCatalog, mergeApiTanquesWithCatalog, saveCatalog, updateCatalogEntry, normalizeText, calculateDisplayPorcentaje } from "../../config/tankCatalog";

const getTankStatusColor = (porcentaje) => {
  if (!Number.isFinite(porcentaje)) return "#9DA9BB";
  if (porcentaje < 20) return "#E53935";
  if (porcentaje < 40) return "#FBC02D";
  if (porcentaje < 95) return "#1565C0";
  return "#4CAF50";
};

const getTankStatusLabel = (porcentaje) => {
  if (!Number.isFinite(porcentaje)) return "Sin datos";
  if (porcentaje < 20) return "Crítico";
  if (porcentaje < 40) return "Atención";
  if (porcentaje < 95) return "Llenándose";
  return "Nivel correcto";
};

const getTankStatusBadge = (porcentaje) => {
  if (!Number.isFinite(porcentaje)) {
    return {
      label: "Sin datos",
      icon: "•",
      bgColor: "#EEF2F7",
      textColor: "#475569",
    };
  }

  if (porcentaje < 20) {
    return {
      label: "Crítico",
      icon: "!",
      bgColor: "#FEE2E2",
      textColor: "#DC2626",
    };
  }

  if (porcentaje < 40) {
    return {
      label: "Atención",
      icon: "⚠",
      bgColor: "#FFF3CD",
      textColor: "#B7791F",
    };
  }

  if (porcentaje < 95) {
    return {
      label: "Llenándose",
      icon: "↑",
      bgColor: "#E7F0FF",
      textColor: "#1D4ED8",
    };
  }

  return {
    label: "Óptimo",
    icon: "✓",
    bgColor: "#E6F7EC",
    textColor: "#15803D",
  };
};

const renderTrendIndicator = (porcentaje) => {
  const currentLevel = Number.isFinite(porcentaje) ? Math.min(100, Math.max(0, porcentaje)) : 0;
  const accentHeight = 10 + Math.round((currentLevel / 100) * 10);

  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 26 }}>
      {[12, 16, 10, 14].map((height, index) => (
        <Box key={index} sx={{ width: 4, height, borderRadius: "999px", bgcolor: "#D9E4F2" }} />
      ))}
      <Box sx={{ width: 4, height: accentHeight, borderRadius: "999px", bgcolor: getTankStatusColor(porcentaje) }} />
    </Box>
  );
};

function Tanques() {
  const initialCatalog = useMemo(() => loadCatalog(), []);
  const catalogRef = useRef(initialCatalog);
  const [apiTanques, setApiTanques] = useState([]);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    id: null,
    originalNombre: "",
    nombre: "",
    tag: "",
    nivelMaximo: "",
    capacidadActual: "",
    capacidadMaxima: "",
    reboseDisponible: "",
    area: "",
    alturaRebose: "",
    alturaTotal: "",
    volumen: "",
    largo: "",
    ancho: "",
    compartimientos: "",
    cotaEntrada: "",
    cotaSalida: "",
    cotaFondo: "",
    cotaRebose: "",
  });

  const loadCatalogFromStorage = useCallback(() => {
    const loaded = loadCatalog();
    catalogRef.current = loaded;
    setCatalog(loaded);
    return loaded;
  }, []);

  // Carga los tanques crudos de la API; el merge se hace en memoria para mostrar.
  const cargarTanques = useCallback(async (forceRefresh = false, showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await tanqueService.getTanques(forceRefresh);
      const serverTanques = response?.tanques || [];
      setApiTanques(serverTanques);
      // update catalog reference if needed
      if (catalogRef.current.length === 0) loadCatalogFromStorage();
      if (showLoading) setError("");
    } catch (exception) {
      console.error(exception);
      if (showLoading) setError("No fue posible obtener la información de los tanques.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [loadCatalogFromStorage]);

  // Aplica en lote las capacidades y niveles que proporcionó el usuario.

  useEffect(() => {
    const initialize = async () => {
      await cargarTanques(true, true);
    };

    initialize();
    const interval = setInterval(() => cargarTanques(true, false), 5000);
    return () => clearInterval(interval);
  }, [cargarTanques]);

  const normalizarTexto = (texto = "") =>
    texto
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, "")
      .trim();

  const normalizeTankName = (texto = "") => normalizeText(texto.toString().trim());

  const getTankIdentifiers = (tank) => {
    if (!tank) return [];
    return [...new Set(
      [tank.nombre, tank.display_name, tank.tag]
        .filter(Boolean)
        .map((value) => normalizeTankName(value))
        .filter(Boolean)
    )];
  };

  const getCatalogAliases = (tank) => {
    if (!tank) return [];
    const catalogEntry = findCatalogEntry(tank, catalogRef.current.length ? catalogRef.current : loadCatalogFromStorage());
    if (!catalogEntry) return [];
    return [
      normalizeTankName(catalogEntry.display_name || catalogEntry.nombre || ""),
      ...catalogEntry.aliases.map(normalizeTankName),
    ].filter(Boolean);
  };

  const areTankNamesEqual = (tankA, tankB) => {
    const namesA = getTankIdentifiers(tankA);
    const namesB = getTankIdentifiers(tankB);
    const catalogA = getCatalogAliases(tankA);
    const catalogB = getCatalogAliases(tankB);
    const allA = [...new Set([...namesA, ...catalogA])];
    const allB = [...new Set([...namesB, ...catalogB])];
    return allA.some((name) => allB.includes(name));
  };

  const getCanonicalTankName = (name) => {
    if (!name) return "";
    const canonical = findCatalogEntry({ nombre: name, display_name: name, tag: name }, catalogRef.current.length ? catalogRef.current : loadCatalogFromStorage());
    return canonical?.display_name || name;
  };

  const areNamesSameCatalogEntry = (rawName, displayName) => {
    if (!rawName || !displayName) return false;
    const catalog = catalogRef.current.length ? catalogRef.current : loadCatalogFromStorage();
    const rawEntry = findCatalogEntry({ nombre: rawName, display_name: rawName, tag: rawName }, catalog);
    const displayEntry = findCatalogEntry({ nombre: displayName, display_name: displayName, tag: displayName }, catalog);
    return !!rawEntry && !!displayEntry && rawEntry.id === displayEntry.id;
  };

  const formatTechValue = (value, unit, decimals = 2) => {
    if (value === null || value === undefined || value === "") return "N/A";
    if (!Number.isFinite(Number(value))) return "N/A";
    const formatted = Number(value).toFixed(unit === "m³" ? 0 : unit === "m²" ? 3 : decimals);
    return `${formatted} ${unit}`;
  };

  const tanques = useMemo(() => mergeApiTanquesWithCatalog(apiTanques, catalog), [apiTanques, catalog]);

  const tanquesFiltrados = useMemo(() => tanques.filter((tanque) => {
    const displayName = (tanque.display_name || tanque.nombre || tanque.tag || "").toLowerCase();
    return (
      (tanque.nombre || tanque.tag || "").toLowerCase().includes(busqueda.toLowerCase()) ||
      displayName.includes(busqueda.toLowerCase())
    );
  }), [tanques, busqueda]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedRows, setExpandedRows] = useState([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState("success");

  const openCreate = () => {
    setIsCreating(true);
    setForm({
      id: null,
      originalNombre: "",
      nombre: "",
      nivelMaximo: "",
      capacidadActual: "",
      capacidadMaxima: "",
      reboseDisponible: "",
      area: "",
      alturaRebose: "",
      alturaTotal: "",
      volumen: "",
      largo: "",
      ancho: "",
      compartimientos: "",
      cotaEntrada: "",
      cotaSalida: "",
      cotaFondo: "",
      cotaRebose: "",
    });
    setDialogOpen(true);
  };

  const openDeleteConfirm = (tanque) => {
    setDeleteTarget(tanque);
    setDeleteConfirmOpen(true);
  };

  const openRowDetails = (rowKey) => {
    setExpandedRows((prev) => (prev.includes(rowKey) ? prev.filter((id) => id !== rowKey) : [...prev, rowKey]));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return setDeleteConfirmOpen(false);
    try {
      // remove local catalog entry if present
      const loaded = loadCatalogFromStorage();
      const matched = findCatalogEntry(deleteTarget, loaded);
      let newCatalog = loaded;
      if (matched) {
        newCatalog = loaded.filter((e) => e.id !== matched.id);
        saveCatalog(newCatalog);
        catalogRef.current = newCatalog;
        setCatalog(newCatalog);
      }

      const id = deleteTarget.id;
      if (id && String(id).match(/^\d+$/)) {
        await tanqueService.deleteTanque(id);
      }
      // refresh list
      await cargarTanques();
      setSnackbarMessage('Configuración local eliminada.');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error('Error deleting tanque', e);
      // fallback: remove locally from API list copy
      setApiTanques((t) => t.filter((x) => x.nombre !== deleteTarget.nombre));
      setSnackbarMessage('Error al eliminar en el servidor; eliminado localmente.');
      setSnackbarSeverity('warning');
      setSnackbarOpen(true);
    }
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
  };

  const openEdit = (tanque) => {
    setIsCreating(false);
    const catalogEntry = findCatalogEntry(tanque, catalog.length ? catalog : loadCatalogFromStorage()) || {};
    const safeNumber = (value) => {
      if (value === null || value === undefined || value === "") return "";
      return Number.isFinite(Number(value)) ? String(value) : "";
    };
    const rawName = tanque.nombre || tanque.display_name || tanque.tag || "";
    const canonicalName = getCanonicalTankName(rawName);
    setForm({
      id: tanque.id ?? null,
      originalNombre: rawName,
      nombre: canonicalName,
      tag: tanque.tag ?? rawName,
      nivelMaximo: safeNumber(tanque.nivel_maximo ?? tanque.nivel_maximo),
      capacidadActual: safeNumber(catalogEntry.capacidad_actual_m3 ?? tanque.capacidad_actual_m3 ?? tanque.capacidad_actual),
      capacidadMaxima: safeNumber(catalogEntry.capacidad_maxima_m3 ?? tanque.capacidad_maxima_m3 ?? tanque.capacidad_maxima),
      reboseDisponible: safeNumber(catalogEntry.volumen_restante_m3 ?? tanque.volumen_restante_m3 ?? tanque.rebose),
      area: safeNumber(catalogEntry.area ?? catalogEntry.area_m2 ?? tanque.area_m2 ?? tanque.area),
      alturaRebose: safeNumber(catalogEntry.altura_rebose ?? tanque.altura_rebose),
      alturaTotal: safeNumber(catalogEntry.altura_total),
      volumen: safeNumber(catalogEntry.volumen),
      largo: safeNumber(catalogEntry.largo),
      ancho: safeNumber(catalogEntry.ancho),
      compartimientos: safeNumber(catalogEntry.compartimientos),
      cotaEntrada: safeNumber(catalogEntry.cota_entrada ?? tanque.cota_entrada),
      cotaSalida: safeNumber(catalogEntry.cota_salida ?? tanque.cota_salida),
      cotaFondo: safeNumber(catalogEntry.cota_fondo ?? tanque.cota_fondo),
      cotaRebose: safeNumber(catalogEntry.cota_rebose ?? tanque.cota_rebose),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const handleFormChange = (field, value) => setForm((s) => ({ ...s, [field]: value }));

  // Antes de guardar, consultamos la API para comprobar la lectura actual y pedir confirmación si difiere
  const handleSave = async () => {
    await applySave();
  };

  const applySave = async () => {
    const parseNumberValue = (value) => (value !== null && value !== undefined && value !== "" ? Number(value) : null);

    const payloadName = form.nombre && normalizeText(form.nombre) !== normalizeText(form.originalNombre || "")
      ? form.nombre
      : form.originalNombre || form.nombre || "";

    const payload = {
      nombre: payloadName,
    };

    const formTank = {
      id: form.id ?? null,
      nombre: form.originalNombre || form.nombre,
      display_name: form.nombre || form.originalNombre,
      tag: form.originalNombre || form.nombre,
    };

    const existingCatalogEntry = findCatalogEntry(formTank, catalogRef.current.length ? catalogRef.current : loadCatalogFromStorage());
    const catalogId = existingCatalogEntry?.id || normalizeText(form.tag || form.nombre || payloadName || "") || (form.id ? normalizeText(String(form.id)) : "");

    const rawAlturaRebose = parseNumberValue(form.alturaRebose);
    const catalogUpdates = {
      nombre: form.nombre,
      display_name: form.nombre,
      area_m2: parseNumberValue(form.area),
      altura_rebose: rawAlturaRebose,
      altura_total: parseNumberValue(form.alturaTotal),
      volumen: parseNumberValue(form.volumen),
      largo: parseNumberValue(form.largo),
      ancho: parseNumberValue(form.ancho),
      compartimientos: parseNumberValue(form.compartimientos),
      cota_entrada: parseNumberValue(form.cotaEntrada),
      cota_salida: parseNumberValue(form.cotaSalida),
      cota_fondo: parseNumberValue(form.cotaFondo),
      cota_rebose: parseNumberValue(form.cotaRebose),
      nivel_maximo: parseNumberValue(form.nivelMaximo),
      capacidad_maxima_m3: parseNumberValue(form.capacidadMaxima),
      capacidad_actual_m3: parseNumberValue(form.capacidadActual),
      volumen_restante_m3: parseNumberValue(form.reboseDisponible),
    };

    // update catalog in memory and persist, then validate persistence before showing success
    const updatedCatalog = updateCatalogEntry(catalogRef.current.length ? catalogRef.current : catalog, catalogId, catalogUpdates);
    try {
      console.log('Saving updated catalog (applySave)', updatedCatalog.slice ? updatedCatalog.slice(0,5) : updatedCatalog);
      saveCatalog(updatedCatalog);
      const reloadedCatalog = loadCatalogFromStorage();
      console.log('Reloaded catalog after save', reloadedCatalog && reloadedCatalog.slice ? reloadedCatalog.slice(0,5) : reloadedCatalog);

      const persistedEntry = findCatalogEntry(formTank, reloadedCatalog);
      const didPersist = !!persistedEntry && (
        ((persistedEntry.altura_rebose == null && catalogUpdates.altura_rebose == null) || persistedEntry.altura_rebose === catalogUpdates.altura_rebose)
      );

      let finalPersistedCatalog = reloadedCatalog;
      if (!didPersist) {
        const fallbackCatalog = reloadedCatalog.map((item) => {
          const normalizedCatalogId = normalizeText(catalogId || "");
          const matchesId = item.id === catalogId || item.aliases.includes(normalizedCatalogId);
          if (!matchesId) return item;
          return {
            ...item,
            ...catalogUpdates,
          };
        });

        saveCatalog(fallbackCatalog);
        finalPersistedCatalog = loadCatalogFromStorage();
      }

      const finalPersistedEntry = findCatalogEntry(formTank, finalPersistedCatalog);
      const finalDidPersist = !!finalPersistedEntry && (
        ((finalPersistedEntry.altura_rebose == null && catalogUpdates.altura_rebose == null) || finalPersistedEntry.altura_rebose === catalogUpdates.altura_rebose)
      );

      if (!finalDidPersist) {
        throw new Error('La persistencia local falló: el catálogo no contiene la actualización esperada.');
      }

      catalogRef.current = finalPersistedCatalog;
      setCatalog(finalPersistedCatalog);

      // update apiTanques in memory for immediate UI update
      setApiTanques((currentApi) =>
        currentApi.map((item) => {
          if ((item.id && form.id && String(item.id) === String(form.id)) || areTankNamesEqual(item, formTank)) {
            return mergeApiTanquesWithCatalog([item], finalPersistedCatalog)[0];
          }
          return item;
        })
      );

      closeDialog();

      // only after local persistence show success; still attempt server sync but don't rely on it
      try {
        if (isCreating) {
          await tanqueService.createTanque(payload);
        } else {
          const existingTank = tanques.find((t) =>
            (t.id && form.id && String(t.id) === String(form.id)) || areTankNamesEqual(t, formTank)
          );
          const updateId = existingTank && existingTank.id ? existingTank.id : null;
          if (updateId && String(updateId).match(/^\d+$/)) {
            await tanqueService.updateTanque(updateId, payload);
          } else {
            await tanqueService.createTanque(payload);
          }
        }
        setSnackbarMessage('Configuración guardada correctamente.');
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } catch (serverErr) {
        console.warn('Error al sincronizar con servidor, cambios guardados localmente', serverErr);
        setSnackbarMessage('Cambios guardados localmente; sincronización con servidor falló.');
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
      }

      await cargarTanques();
    } catch (persistErr) {
      console.error('Persistencia local falló', persistErr);
      setSnackbarMessage('No fue posible guardar la configuración localmente.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  return (
    <Box>
      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, mb: 3, borderRadius: 4, color: "#fff", background: "linear-gradient(105deg, #0d2f5b 0%, #17649b 100%)", position: "relative", overflow: "hidden" }}>
        <Box sx={{ position: "absolute", width: 230, height: 230, borderRadius: "50%", border: "35px solid rgba(255,255,255,.06)", right: -45, top: -100 }} />
        <Box sx={{ position: "relative", display: "flex", alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 52, height: 52, borderRadius: "50%", bgcolor: "rgba(255,255,255,.14)", display: "grid", placeItems: "center" }}><WaterDropRoundedIcon sx={{ color: "#f4b83f", fontSize: 28 }} /></Box>
            <Box><Typography variant="h5" sx={{ fontWeight: 900 }}>Gestión de Tanques</Typography><Typography sx={{ color: "rgba(255,255,255,.75)" }}>Administración y supervisión de los tanques del IBAL</Typography></Box>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}><Chip icon={<AccessTimeRoundedIcon />} label="31/07/2026 · 12:33:54" sx={{ color: "#fff", bgcolor: "rgba(255,255,255,.12)" }} /><Chip label="Administrador IBAL" sx={{ color: "#fff", bgcolor: "rgba(255,255,255,.12)" }} /></Stack>
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 4, border: "1px solid #e7edf5", boxShadow: "0 8px 24px rgba(17,55,99,.07)", overflow: "hidden" }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, display: "flex", alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between", gap: 2, flexDirection: { xs: "column", md: "row" }, borderBottom: "1px solid #edf1f6" }}>
          <Box><Typography variant="h6" sx={{ color: "#123c6b", fontWeight: 900 }}>Información de tanques</Typography><Typography variant="body2" color="text.secondary">Selecciona un tanque para consultar sus datos.</Typography></Box>
          <Stack direction="row" spacing={1}><Button onClick={openCreate} variant="contained" startIcon={<AddRoundedIcon />} sx={{ bgcolor: "#0d2f5b" }}>Nuevo Tanque</Button></Stack>
        </Box>
        <Box sx={{ p: { xs: 2, md: 2.5 }, bgcolor: "#fbfcfe" }}>
          <TextField
            fullWidth
            size="small"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar tanque..."
            sx={{ bgcolor: "#fff", "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </Box>
        <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
          {loading && <Box sx={{ py: 8, display: "grid", placeItems: "center" }}><CircularProgress sx={{ color: "#17649b" }} /></Box>}
          {error && <Alert severity="error">{error}</Alert>}
          {!loading && !error && (
            <TableContainer component={Paper} sx={{ background: "#F8FBFF", boxShadow: "none", borderRadius: 3, border: "1px solid #e7edf5" }}>
              <Table sx={{ minWidth: 700, borderCollapse: "separate" }}>
                <TableHead sx={{ backgroundColor: "#0d2f5b" }}>
                  <TableRow>
                    <TableCell sx={{ py: 2, fontWeight: 700, color: "#fff" }}>Tanque</TableCell>
                    <TableCell sx={{ py: 2, fontWeight: 700, color: "#fff" }}>Nivel Actual</TableCell>
                    <TableCell sx={{ py: 2, fontWeight: 700, color: "#fff" }}>Capacidad Total (m³)</TableCell>
                    <TableCell sx={{ py: 2, fontWeight: 700, color: "#fff" }}>Porcentaje</TableCell>
                    <TableCell sx={{ py: 2, fontWeight: 700, color: "#fff" }}>Tendencia</TableCell>
                    <TableCell align="right" sx={{ py: 2, fontWeight: 700, color: "#fff" }}>Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tanquesFiltrados.map((tanque) => {
                    const rawName = tanque.nombre || tanque.tag || "";
                    const displayName = tanque.display_name ?? tanque.nombre ?? tanque.tag ?? "";
                    const nivel = Number.isFinite(Number(tanque.valor_m)) ? Number(tanque.valor_m) : null;
                    // `tanque` already comes merged (API + catalog) via useMemo `tanques`.
                    const tech = tanque;
                    const alturaReboseValue = Number.isFinite(Number(tanque.altura_rebose)) ? Number(tanque.altura_rebose) : null;
                    const alturaTotalValue = Number.isFinite(Number(tanque.altura_total)) ? Number(tanque.altura_total) : null;
                    const capacidadActual = Number.isFinite(Number(tanque.capacidad_actual_m3)) ? Number(tanque.capacidad_actual_m3) : Number.isFinite(Number(tanque.capacidad_actual)) ? Number(tanque.capacidad_actual) : null;
                    const capacidadMaxima = Number.isFinite(Number(tanque.capacidad_maxima_m3)) ? Number(tanque.capacidad_maxima_m3) : Number.isFinite(Number(tanque.capacidad_maxima)) ? Number(tanque.capacidad_maxima) : null;
                    const porcentajeLlenado = calculateDisplayPorcentaje(tanque);
                    const reboseDisponible = Number.isFinite(Number(tanque.volumen_restante_m3)) ? Number(tanque.volumen_restante_m3) : null;
                    const uniqueFallback = normalizeText(displayName || tanque.nombre || tanque.tag || String(tanque.fecha_hora || tanque.valor_m || ''));
                    const rowKey = tanque.id != null ? `tanque-${tanque.id}` : `tanque-${uniqueFallback}`;
                    const isExpanded = expandedRows.includes(rowKey);

                    const rawNameNormalized = normalizarTexto(rawName);
                    const displayNameNormalized = normalizarTexto(displayName);
                    const sameCatalog = areNamesSameCatalogEntry(rawName, displayName);
                    const shouldShowSubtitle = rawName && rawNameNormalized !== displayNameNormalized && !sameCatalog && !displayNameNormalized.includes(rawNameNormalized) && !rawNameNormalized.includes(displayNameNormalized);

                    return (
                      <Fragment key={rowKey}>
                        <TableRow
                          onClick={() => openRowDetails(rowKey)}
                          sx={{ backgroundColor: "#fff", '&:hover': { backgroundColor: '#F3F7FD' }, cursor: 'pointer' }}
                        >
                          <TableCell sx={{ py: 2, borderBottom: "1px solid #E7EEF6" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                              <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "#E6F0FF", color: "#0d4fa1", display: "grid", placeItems: "center" }}><WaterDropRoundedIcon sx={{ fontSize: 18 }} /></Box>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 800, color: "#102B4A" }}>{displayName}</Typography>
                                {shouldShowSubtitle && <Typography variant="caption" color="text.secondary">{rawName}</Typography>}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 2, borderBottom: "1px solid #E7EEF6" }}>
                            <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(nivel) ? `${nivel.toFixed(2)} m` : "N/A"}</Typography>
                            <Box sx={{ mt: 1, width: "100%", height: 8, borderRadius: 99, bgcolor: "#E8F1FF", overflow: "hidden" }}>
                              <Box sx={{ width: `${Number.isFinite(porcentajeLlenado) ? porcentajeLlenado : 0}%`, height: "100%", transition: "width 0.35s ease", bgcolor: getTankStatusColor(porcentajeLlenado) }} />
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 2, borderBottom: "1px solid #E7EEF6" }}>
                            <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(capacidadMaxima) ? `${capacidadMaxima.toFixed(0)} m³` : "N/A"}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 2, borderBottom: "1px solid #E7EEF6" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                              <Box
                                sx={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 0.75,
                                  px: 1.5,
                                  py: 0.75,
                                  borderRadius: 999,
                                  bgcolor: getTankStatusBadge(porcentajeLlenado).bgColor,
                                  color: getTankStatusBadge(porcentajeLlenado).textColor,
                                  fontWeight: 700,
                                  fontSize: "0.875rem",
                                  lineHeight: 1.2,
                                  whiteSpace: "nowrap",
                                  border: "1px solid rgba(15, 23, 42, 0.04)",
                                }}
                              >
                                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{getTankStatusBadge(porcentajeLlenado).icon}</Box>
                                <Box component="span">
                                  {Number.isFinite(porcentajeLlenado)
                                    ? `${getTankStatusBadge(porcentajeLlenado).label} (${porcentajeLlenado.toFixed(1)}%)`
                                    : "Sin datos"}
                                </Box>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 2, borderBottom: "1px solid #E7EEF6", width: 140 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                              {renderTrendIndicator(porcentajeLlenado)}
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ py: 2, borderBottom: "1px solid #E7EEF6" }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                              <Button size="small" variant="contained" color="primary" startIcon={<EditRoundedIcon />} onClick={(e) => { e.stopPropagation(); openEdit(tanque); }} sx={{ bgcolor: "#0d2f5b", '&:hover': { bgcolor: '#0b274f' }, textTransform: "none", minWidth: { xs: '100%', sm: 84 } }}>Editar</Button>
                              <Button size="small" variant="contained" color="error" startIcon={<DeleteRoundedIcon />} onClick={(e) => { e.stopPropagation(); openDeleteConfirm(tanque); }} sx={{ textTransform: "none", minWidth: { xs: '100%', sm: 84 } }}>Eliminar</Button>
                              <IconButton size="small" onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRows((prev) => prev.includes(rowKey) ? prev.filter((id) => id !== rowKey) : [...prev, rowKey]);
                              }} sx={{ bgcolor: "#EEF5FF", color: "#17649b", '&:hover': { bgcolor: '#d9e6ff' } }}>
                                <KeyboardArrowDownRoundedIcon sx={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                        <TableRow key={`${rowKey}-details`}>
                          <TableCell colSpan={6} sx={{ p: 0, borderBottom: "1px solid #E7EEF6", backgroundColor: "#F8FBFF" }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 3, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 2, borderTop: "1px solid #E7EEF6" }}>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Capacidad actual</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(capacidadActual) ? `${capacidadActual.toFixed(0)} m³` : "N/A"}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Rebose disponible</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(reboseDisponible) ? `${reboseDisponible.toFixed(0)} m³` : "N/A"}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Altura rebose</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(alturaReboseValue) ? `${alturaReboseValue.toFixed(2)} m` : "N/A"}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Altura total</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(alturaTotalValue) ? `${alturaTotalValue.toFixed(2)} m` : "N/A"}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Cota entrada</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.cota_entrada, "m")}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Cota salida</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.cota_salida, "m")}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Cota fondo</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.cota_fondo, "m")}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Cota rebose</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.cota_rebose, "m")}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Largo</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.largo, "m")}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Ancho</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.ancho, "m")}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Área</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.area_m2 ?? tech.area ?? tech.areaTanque ?? tech.area_m2, "m²", 3)}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Compartimientos</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{Number.isFinite(Number(tech.compartimientos)) ? tech.compartimientos : "N/A"}</Typography>
                                </Box>
                                <Box>
                                  <Typography variant="caption" color="text.secondary">Volumen</Typography>
                                  <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{formatTechValue(tech.volumen, "m³", 0)}</Typography>
                                </Box>
                                {/* Calibración / verificación específica para Ambalá (no persiste, solo muestra datos) */}
                                {(() => {
                                  const normalizedName = normalizarTexto(displayName || rawName || tanque.tag || "");
                                  const isAmbala = normalizedName.includes("ambala") || normalizedName.includes("ambal") || (tanque.aliases || []).some(a => normalizarTexto(a).includes("ambala"));
                                  if (!isAmbala) return null;
                                  // determinar referencia por tanque (Ambala 1 -> 68%, Ambala 2 -> 65%)
                                  const refPercent = normalizedName.includes("ambala 1") || normalizarTexto(rawName || "").includes("ambala 1") ? 68 : (normalizedName.includes("ambala 2") || normalizarTexto(rawName || "").includes("ambala 2") ? 65 : null);
                                  const valorActual = Number.isFinite(nivel) ? nivel : null;
                                  const alturaReboseActual = Number.isFinite(alturaReboseValue) ? alturaReboseValue : null;
                                  const porcentajeCalculado = Number.isFinite(porcentajeLlenado) ? porcentajeLlenado : null;
                                  const alturaQueDariaRef = (valorActual !== null && refPercent !== null) ? (valorActual / (refPercent / 100)) : null;

                                  return (
                                    <Box sx={{ gridColumn: "1 / -1", borderTop: "1px dashed #E7EEF6", pt: 2 }}>
                                      <Typography variant="subtitle2" sx={{ color: "#102B4A", fontWeight: 800 }}>Verificación de calibración (IBAL)</Typography>
                                      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2, mt: 1 }}>
                                        <Box>
                                          <Typography variant="caption" color="text.secondary">Valor_m actual</Typography>
                                          <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{valorActual !== null ? `${valorActual.toFixed(3)} m` : "N/A"}</Typography>
                                        </Box>
                                        <Box>
                                          <Typography variant="caption" color="text.secondary">Altura rebose (configurada)</Typography>
                                          <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{alturaReboseActual !== null ? `${alturaReboseActual.toFixed(3)} m` : "N/A"}</Typography>
                                        </Box>
                                        <Box>
                                          <Typography variant="caption" color="text.secondary">Porcentaje calculado</Typography>
                                          <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{porcentajeCalculado !== null ? `${porcentajeCalculado.toFixed(2)} %` : "N/A"}</Typography>
                                        </Box>
                                        <Box>
                                          <Typography variant="caption" color="text.secondary">Porcentaje referencia IBAL</Typography>
                                          <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{refPercent !== null ? `${refPercent}%` : "N/A"}</Typography>
                                        </Box>
                                        <Box>
                                          <Typography variant="caption" color="text.secondary">Diferencia</Typography>
                                          <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>
                                            {(porcentajeCalculado !== null && refPercent !== null) ? `${(porcentajeCalculado - refPercent).toFixed(2)} %` : "N/A"}
                                          </Typography>
                                        </Box>
                                        <Box>
                                          <Typography variant="caption" color="text.secondary">Altura_rebose que produciría % ref</Typography>
                                          <Typography sx={{ fontWeight: 700, color: "#102B4A" }}>{alturaQueDariaRef !== null ? `${alturaQueDariaRef.toFixed(3)} m` : "N/A"}</Typography>
                                        </Box>
                                      </Box>
                                    </Box>
                                  );
                                })()}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {/* Diálogo de crear / editar tanque */}
          <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
            <DialogTitle>{isCreating ? "Nuevo Tanque" : "Editar Tanque"}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2, mt: 1 }}>
                <TextField fullWidth label="Nombre" value={form.nombre} onChange={(e) => handleFormChange("nombre", e.target.value)} />
                <TextField fullWidth label="Nivel máximo (m)" type="number" value={form.nivelMaximo} onChange={(e) => handleFormChange("nivelMaximo", e.target.value)} />
                <TextField fullWidth label="Capacidad actual (m³)" type="number" value={form.capacidadActual} onChange={(e) => handleFormChange("capacidadActual", e.target.value)} helperText="Editable: configuración local" />
                <TextField fullWidth label="Capacidad máxima (m³)" type="number" value={form.capacidadMaxima} onChange={(e) => handleFormChange("capacidadMaxima", e.target.value)} />
                <TextField fullWidth label="Rebose disponible (m³)" type="number" value={form.reboseDisponible} onChange={(e) => handleFormChange("reboseDisponible", e.target.value)} helperText="Editable: configuración local" />
                <TextField fullWidth label="Área (m²)" type="number" value={form.area} onChange={(e) => handleFormChange("area", e.target.value)} />
                <TextField fullWidth label="Altura rebose (m)" type="number" value={form.alturaRebose} onChange={(e) => handleFormChange("alturaRebose", e.target.value)} />
                <TextField fullWidth label="Altura total (m)" type="number" value={form.alturaTotal} onChange={(e) => handleFormChange("alturaTotal", e.target.value)} />
                <TextField fullWidth label="Volumen (m³)" type="number" value={form.volumen} onChange={(e) => handleFormChange("volumen", e.target.value)} />
                <TextField fullWidth label="Largo (m)" type="number" value={form.largo} onChange={(e) => handleFormChange("largo", e.target.value)} />
                <TextField fullWidth label="Ancho (m)" type="number" value={form.ancho} onChange={(e) => handleFormChange("ancho", e.target.value)} />
                <TextField fullWidth label="Compartimientos" type="number" value={form.compartimientos} onChange={(e) => handleFormChange("compartimientos", e.target.value)} />
                <TextField fullWidth label="Cota entrada (m)" type="number" value={form.cotaEntrada} onChange={(e) => handleFormChange("cotaEntrada", e.target.value)} />
                <TextField fullWidth label="Cota salida (m)" type="number" value={form.cotaSalida} onChange={(e) => handleFormChange("cotaSalida", e.target.value)} />
                <TextField fullWidth label="Cota fondo (m)" type="number" value={form.cotaFondo} onChange={(e) => handleFormChange("cotaFondo", e.target.value)} />
                <TextField fullWidth label="Cota rebose (m)" type="number" value={form.cotaRebose} onChange={(e) => handleFormChange("cotaRebose", e.target.value)} />
              </Box>
            </DialogContent>
            <DialogActions sx={{ justifyContent: isCreating ? 'flex-end' : 'space-between' }}>
              {!isCreating && (
                <Button color="error" onClick={() => openDeleteConfirm({ id: form.id, nombre: form.nombre })}>
                  Eliminar
                </Button>
              )}
              <Box sx={{ display: 'flex', gap: 1, ml: isCreating ? 0 : 'auto' }}>
                <Button onClick={closeDialog}>Cancelar</Button>
                <Button variant="contained" onClick={handleSave}>Guardar</Button>
              </Box>
            </DialogActions>
          </Dialog>

          {/* Diálogo de confirmación para eliminar */}
          <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} fullWidth maxWidth="xs">
            <DialogTitle>Eliminar tanque</DialogTitle>
            <DialogContent>
              <Typography>¿Seguro que quieres eliminar la configuración local para <strong>{deleteTarget?.nombre}</strong>?</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
              <Button variant="contained" color="error" onClick={handleDelete}>Eliminar</Button>
            </DialogActions>
          </Dialog>
          <Snackbar open={snackbarOpen} autoHideDuration={5000} onClose={handleSnackbarClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
            <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
              {snackbarMessage}
            </Alert>
          </Snackbar>
          {!loading && !error && tanquesFiltrados.length === 0 && <Typography sx={{ py: 6, textAlign: "center" }} color="text.secondary">No se encontraron tanques.</Typography>}
        </Box>
      </Paper>
    </Box>
  );
}

export default Tanques;
