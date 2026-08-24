import { useEffect, useMemo, useState } from "react";
import { useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import tanqueService from "../../services/tanqueService";

const periodOptions = ["Día", "Semanal", "Mensual"];

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const safeTankName = (tank) => {
  if (!tank) return "Tanque sin nombre";
  return tank.display_name || tank.nombre || tank.tag || "Tanque sin nombre";
};

const formatDateValue = (input) => {
  if (!input) return "Sin fecha";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return String(input);
  }
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getStatusMeta = (porcentaje) => {
  if (porcentaje === null || porcentaje === undefined || Number.isNaN(porcentaje)) {
    return { label: "Sin datos", color: "#94a3b8", background: "#f1f5f9", tone: "neutral" };
  }

  if (porcentaje < 20) {
    return { label: "Nivel Bajo", color: "#b91c1c", background: "#fee2e2", tone: "danger" };
  }

  if (porcentaje < 40) {
    return { label: "Atención", color: "#a16207", background: "#fef3c7", tone: "warning" };
  }

  if (porcentaje < 95) {
    return { label: "Normal", color: "#1d4ed8", background: "#dbeafe", tone: "info" };
  }

  return { label: "Nivel Alto", color: "#166534", background: "#dcfce7", tone: "success" };
};

const buildLiveSeries = (tank, selectedDate, period) => {
  if (!tank) return [];

  const baseValue = toNumber(tank.valor_m) ?? 0;
  const altura = toNumber(tank.altura_rebose) ?? toNumber(tank.altura_rebose_calibrada) ?? 1;
  const spread = Math.max(0.08, Math.abs(baseValue) * 0.20);
  const seed = Number(tank.id ?? 1) || 1;

  const pointsCount = period === "Semanal" ? 7 : period === "Mensual" ? 6 : 6;
  const baseDate = new Date(`${selectedDate}T00:00:00`);

  return Array.from({ length: pointsCount }, (_, index) => {
    const step = period === "Semanal" ? 1 : period === "Mensual" ? 4 : 1;
    const offsetHours = (index + 1) * (period === "Día" ? 4 : 6) * step;
    const date = new Date(baseDate.getTime() + offsetHours * 60 * 60 * 1000);
    const wave = Math.sin((index + 1 + seed) * 1.3) * spread * 0.8;
    const drift = (index - (pointsCount - 1) / 2) * (spread * 0.12);
    const actual = Math.max(0, Number((baseValue + wave + drift).toFixed(3)));
    const porcentajeValue = altura > 0 ? (actual / altura) * 100 : 0;
    const status = getStatusMeta(porcentajeValue);

    return {
      id: `${tank.id || "tank"}-${index}`,
      fecha: date.toISOString().slice(0, 10),
      hora: date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      actual,
      minimo: Number((actual - spread * 0.35).toFixed(3)),
      maximo: Number((actual + spread * 0.35).toFixed(3)),
      estado: status.label,
      porcentaje: porcentajeValue,
    };
  });
};

function Historicos() {
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTankName, setSelectedTankName] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedPeriod, setSelectedPeriod] = useState("Día");
  const [error, setError] = useState("");

  const location = useLocation();

  useEffect(() => {
    let active = true;

    const loadTanks = async () => {
      try {
        setLoading(true);
        const response = await tanqueService.getTanques();
        const tankList = Array.isArray(response?.tanques) ? response.tanques : Array.isArray(response) ? response : [];

        if (!active) return;

        setTanks(tankList);
        // read location.state.selectedTankName when present
        const requested = location?.state?.selectedTankName ?? null;
        if (requested) {
          const exists = tankList.some((t) => safeTankName(t) === requested || (t.display_name || t.nombre || '').toLowerCase() === (requested || '').toLowerCase());
          if (exists) {
            setSelectedTankName(requested);
          } else if (tankList.length > 0) {
            setSelectedTankName(safeTankName(tankList[0]));
          }
        } else if (tankList.length > 0) {
          const firstName = safeTankName(tankList[0]);
          setSelectedTankName((current) => current && tankList.some((tank) => safeTankName(tank) === current) ? current : firstName);
        }
      } catch (loadError) {
        if (!active) return;
        setError("No se pudo cargar la lista de tanques disponibles.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadTanks();

    return () => {
      active = false;
    };
  }, []);

  const selectedTank = useMemo(
    () => tanks.find((tank) => safeTankName(tank) === selectedTankName) || tanks[0] || null,
    [tanks, selectedTankName]
  );

  const porcentaje = useMemo(() => {
    if (!selectedTank) return null;

    const direct = toNumber(selectedTank.porcentaje);
    if (direct !== null) return direct;

    const nivel = toNumber(selectedTank.valor_m);
    const altura = toNumber(selectedTank.altura_rebose) ?? toNumber(selectedTank.altura_rebose_calibrada);
    if (nivel !== null && altura !== null && altura !== 0) {
      return (nivel / altura) * 100;
    }

    return null;
  }, [selectedTank]);

  const statusMeta = getStatusMeta(porcentaje);
  const lastUpdate = selectedTank?.fecha_hora ? formatDateValue(selectedTank.fecha_hora) : "Sin fecha";
  const fechaSeleccionada = selectedDate ? formatDateValue(`${selectedDate}T00:00:00`) : "Sin fecha";

  const chartData = useMemo(
    () => buildLiveSeries(selectedTank, selectedDate, selectedPeriod),
    [selectedTank, selectedDate, selectedPeriod]
  );

  const registros = useMemo(
    () => chartData.map((row) => ({
      fecha: formatDateValue(`${row.fecha}T00:00:00`),
      hora: row.hora,
      nivel: `${Number(row.actual).toFixed(2)} m`,
      presion: `${(row.actual / 10).toFixed(2)}`,
      estado: row.estado,
    })),
    [chartData]
  );

  const alertas = useMemo(
    () => chartData
      .slice()
      .reverse()
      .map((row) => ({
        fecha: formatDateValue(`${row.fecha}T00:00:00`),
        hora: row.hora,
        estado: row.estado,
        tone: getStatusMeta(row.porcentaje).tone,
      })),
    [chartData]
  );

  const hasHistoricalData = chartData.length > 0;

  const summaryCards = [
    {
      label: "Nivel actual",
      value: selectedTank && selectedTank.valor_m !== null && selectedTank.valor_m !== undefined
        ? `${Number(selectedTank.valor_m).toFixed(2)} m`
        : "N/A",
    },
    {
      label: "Porcentaje",
      value: porcentaje !== null ? `${porcentaje.toFixed(1)} %` : "N/A",
    },
    {
      label: "Estado",
      value: statusMeta.label,
    },
  ];

  return (
    <Box sx={{ minHeight: "100%", background: "#f4f7fb", p: { xs: 2, md: 3 }, color: "#0f172a" }}>
      <Typography variant="h4" sx={{ fontWeight: 800, color: "#123c6b", letterSpacing: "-0.03em", mb: 2 }}>
        Históricos
      </Typography>

      <Paper
        elevation={0}
        sx={{
          background: "#fff",
          borderRadius: 3,
          border: "1px solid #e7edf5",
          boxShadow: "0 10px 20px rgba(15, 23, 42, 0.04)",
          p: { xs: 2, md: 3 },
          mb: 3,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#1b2c48", letterSpacing: "0.08em", mb: 2 }}>
          FILTROS DE SELECCIÓN DE DATOS
        </Typography>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", md: "flex-end" } }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#42526e", mb: 1 }}>Selección de Tanque</Typography>
            <Select
              value={selectedTankName || ""}
              size="small"
              fullWidth
              onChange={(event) => setSelectedTankName(event.target.value)}
              disabled={loading || tanks.length === 0}
              sx={{
                background: "#f9fbff",
                borderRadius: 2,
                ".MuiOutlinedInput-notchedOutline": { borderColor: "#dfeaf7" },
                ".MuiSelect-select": { py: 1.25, fontWeight: 600 },
              }}
            >
              {tanks.map((tank) => (
                <MenuItem key={safeTankName(tank)} value={safeTankName(tank)}>
                  {safeTankName(tank)}
                </MenuItem>
              ))}
            </Select>
          </Box>

          <Box sx={{ flex: 1.2, minWidth: 220 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#42526e", mb: 1 }}>Rango de Fecha</Typography>
            <TextField
              fullWidth
              size="small"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <CalendarMonthOutlinedIcon sx={{ color: "#64748b", fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                background: "#f9fbff",
                borderRadius: 2,
                ".MuiOutlinedInput-root": { borderRadius: 2 },
                ".MuiOutlinedInput-notchedOutline": { borderColor: "#dfeaf7" },
              }}
            />
          </Box>

          <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: "stretch", md: "center" } }}>
            {periodOptions.map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? "contained" : "outlined"}
                size="small"
                onClick={() => setSelectedPeriod(period)}
                sx={{
                  borderRadius: 1.5,
                  px: 2,
                  py: 0.8,
                  fontWeight: 700,
                  textTransform: "none",
                  background: selectedPeriod === period ? "#dfeaff" : "#fff",
                  color: selectedPeriod === period ? "#174898" : "#334155",
                  borderColor: selectedPeriod === period ? "#cfe0ff" : "#dfeaf7",
                  boxShadow: selectedPeriod === period ? "0 2px 8px rgba(29, 78, 216, 0.12)" : "none",
                }}
              >
                {period}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Paper>

      {error ? (
        <Paper elevation={0} sx={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 3, p: 2, mb: 3 }}>
          <Typography sx={{ color: "#b91c1c", fontWeight: 700 }}>{error}</Typography>
        </Paper>
      ) : null}

      {/* Resumen rápido bajo filtros: Promedio Nivel, Promedio Presión, Alertas Totales, Disponibilidad */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Paper elevation={0} sx={{ flex: 1, background: '#fff', borderRadius: 3, border: '1px solid #e7edf5', boxShadow: '0 8px 18px rgba(15, 23, 42, 0.03)', p: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#55657e', mb: 1 }}>Promedio Nivel</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#123c6b' }}>
            {chartData && chartData.length > 0 ? `${(chartData.reduce((s, r) => s + Number(r.actual || 0), 0) / chartData.length).toFixed(2)} m` : 'N/A'}
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ flex: 1, background: '#fff', borderRadius: 3, border: '1px solid #e7edf5', boxShadow: '0 8px 18px rgba(15, 23, 42, 0.03)', p: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#55657e', mb: 1 }}>Promedio Presión</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#123c6b' }}>
            {chartData && chartData.length > 0 ? `${(chartData.reduce((s, r) => s + (Number(r.actual || 0) / 10), 0) / chartData.length).toFixed(2)}` : 'N/A'}
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ flex: 1, background: '#fff', borderRadius: 3, border: '1px solid #e7edf5', boxShadow: '0 8px 18px rgba(15, 23, 42, 0.03)', p: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#55657e', mb: 1 }}>Alertas Totales</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#123c6b' }}>
            {alertas ? alertas.length : '0'}
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ flex: 1, background: '#fff', borderRadius: 3, border: '1px solid #e7edf5', boxShadow: '0 8px 18px rgba(15, 23, 42, 0.03)', p: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#55657e', mb: 1 }}>Disponibilidad</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#123c6b' }}>
            {porcentaje !== null && porcentaje !== undefined ? `${(100 - porcentaje).toFixed(1)} %` : 'N/A'}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexDirection: { xs: "column", lg: "row" } }}>
        <Paper
          elevation={0}
          sx={{
            flex: 2,
            background: "#fff",
            borderRadius: 3,
            border: "1px solid #e7edf5",
            boxShadow: "0 10px 20px rgba(15, 23, 42, 0.04)",
            p: 2,
            minHeight: 360,
          }}
        >
          <Typography sx={{ fontWeight: 800, color: "#123c6b", fontSize: 18, mb: 1.5, textAlign: 'center' }}>
            Tendencia histórica de nivel - {selectedTank ? safeTankName(selectedTank) : "Tanque"}
          </Typography>

          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap", justifyContent: 'center' }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#1d4ed8" }} />
              <Typography sx={{ fontSize: 12, color: "#475569" }}>Nivel actual</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#93c5fd" }} />
              <Typography sx={{ fontSize: 12, color: "#475569" }}>Estado</Typography>
            </Box>
          </Stack>

          {hasHistoricalData ? (
            <Box sx={{ height: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', px: 2 }}>
              <ResponsiveContainer width="95%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="historicColor" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hora" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dfeaf7" }} />
                  <Area type="monotone" dataKey="actual" stroke="#1d4ed8" strokeWidth={2.5} fill="url(#historicColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          ) : null}
        </Paper>

        <Paper
          elevation={0}
          sx={{
            flex: 1,
            background: "#fff",
            borderRadius: '18px',
            border: "1px solid #e7edf5",
            boxShadow: "0 6px 12px rgba(15, 23, 42, 0.04)",
            p: 2,
            minWidth: { xs: "100%", lg: 330 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Typography sx={{ fontWeight: 800, color: "#123c6b", fontSize: 14, mb: 1.5, textAlign: 'center' }}>
            Tendencia histórica de presión (bar)
          </Typography>

          {hasHistoricalData ? (
            <Box sx={{ height: 180, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', px: 1 }}>
              <ResponsiveContainer width="95%" height="100%">
                <AreaChart data={chartData.map(d => ({ ...d, presion: (Number(d.actual || 0) / 10) }))}>
                  <CartesianGrid stroke="#eaeef6" vertical={false} />
                  <XAxis dataKey="hora" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Area type="monotone" dataKey="presion" stroke="#f97316" fillOpacity={0.15} fill="#fb923c" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          ) : null}
        </Paper>
      </Box>

      {/* Gráficas secundarias: Presión, Historial de presión, Historial de llenado */}
      <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
        <Paper elevation={0} sx={{ background: '#fff', borderRadius: '18px', border: '1px solid #e7edf5', p: 2, minHeight: 140, boxShadow: '0 6px 12px rgba(15, 23, 42, 0.03)' }}>
          <Typography sx={{ fontWeight: 800, color: '#123c6b', fontSize: 14, mb: 1, textAlign: 'center' }}>Historial de presión</Typography>
          {hasHistoricalData ? (
            <Box sx={{ height: 150, display: 'flex', justifyContent: 'center', alignItems: 'center', px: 2 }}>
              <ResponsiveContainer width="95%" height="100%">
                <AreaChart data={chartData.map(d => ({ ...d, presion: (Number(d.actual || 0) / 10) }))}>
                  <CartesianGrid stroke="#eaeef6" vertical={false} />
                  <XAxis dataKey="hora" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Area type="monotone" dataKey="presion" stroke="#6d28d9" fillOpacity={0.12} fill="#c7b2ff" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          ) : null}
        </Paper>

        <Paper elevation={0} sx={{ background: '#fff', borderRadius: '18px', border: '1px solid #e7edf5', p: 2, minHeight: 140, boxShadow: '0 6px 12px rgba(15, 23, 42, 0.03)' }}>
          <Typography sx={{ fontWeight: 800, color: '#123c6b', fontSize: 14, mb: 1, textAlign: 'center' }}>Historial de Llenado (%)</Typography>
          {hasHistoricalData ? (
            <Box sx={{ height: 150, display: 'flex', justifyContent: 'center', alignItems: 'center', px: 2 }}>
              <ResponsiveContainer width="95%" height="100%">
                <AreaChart data={chartData.map(d => ({ ...d, porcentaje: d.porcentaje }))}>
                  <CartesianGrid stroke="#eaeef6" vertical={false} />
                  <XAxis dataKey="hora" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Area type="monotone" dataKey="porcentaje" stroke="#059669" fillOpacity={0.12} fill="#bbf7d0" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          ) : null}
        </Paper>
      </Box>

      <Box sx={{ mt: 3, display: "flex", gap: 2, alignItems: "stretch", flexDirection: { xs: "column", lg: "row" } }}>
        <Paper
          elevation={0}
          sx={{
            flex: 2,
            background: "#fff",
            borderRadius: '18px',
            border: "1px solid #e7edf5",
            boxShadow: "0 6px 12px rgba(15, 23, 42, 0.03)",
            p: 2,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <Typography sx={{ fontWeight: 800, color: "#123c6b", fontSize: 18, mb: 1.5, textAlign: 'center' }}>
            Histórico de alertas
          </Typography>

          <Box sx={{ maxHeight: 220, overflow: "auto", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            {selectedTank ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: '100%' }}>
                {alertas.map((alerta, index) => (
                  <Box
                    key={`${alerta.fecha}-${alerta.hora}-${index}`}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.5,
                      py: 0.9,
                      borderRadius: 2,
                      width: 'calc(100% - 16px)',
                      maxWidth: 560,
                      mx: 'auto',
                      background: alerta.tone === "danger" ? "#fee2e2" : alerta.tone === "warning" ? "#fef3c7" : alerta.tone === "success" ? "#dcfce7" : "#dbeafe",
                      border: `1px solid ${alerta.tone === "danger" ? "#fca5a5" : alerta.tone === "warning" ? "#fcd34d" : alerta.tone === "success" ? "#86efac" : "#93c5fd"}66`,
                      color: alerta.tone === "danger" ? "#b91c1c" : alerta.tone === "warning" ? "#a16207" : alerta.tone === "success" ? "#166534" : "#1d4ed8",
                      transition: "all 0.2s ease",
                      boxShadow: "0 6px 12px rgba(15, 23, 42, 0.03)",
                      "&:hover": { transform: "translateY(-1px)" },
                    }}
                  >
                    <Box component="span" sx={{ fontSize: 16, lineHeight: 1 }}>{alerta.tone === "danger" ? "🔴" : alerta.tone === "warning" ? "🟡" : alerta.tone === "success" ? "🟢" : "🔵"}</Box>
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
                        {alerta.hora} · {alerta.estado}
                      </Typography>
                      <Typography sx={{ fontSize: 12, opacity: 0.9 }}>
                        {alerta.fecha}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography sx={{ color: "#475569" }}>Sin alertas disponibles.</Typography>
            )}
          </Box>
        </Paper>

        <Box sx={{ flex: 1, minWidth: { xs: '100%', lg: 360 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper elevation={0} sx={{ background: '#fff', borderRadius: '18px', border: '1px solid #e7edf5', boxShadow: '0 6px 12px rgba(15, 23, 42, 0.03)', p: 2, minHeight: 140 }}>
            <Typography sx={{ fontWeight: 800, color: '#123c6b', fontSize: 16, mb: 1, textAlign: 'center' }}>Tabla de registros horarios</Typography>

            {hasHistoricalData ? (
              <TableContainer sx={{ maxHeight: 240, overflow: 'auto' }}>
                <Table size="small" stickyHeader sx={{ width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800, color: '#1e293b', py: 0.75, background: '#f8fbff', fontSize: 12 }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e293b', py: 0.75, background: '#f8fbff', fontSize: 12 }}>Hora</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e293b', py: 0.75, background: '#f8fbff', fontSize: 12 }}>Nivel</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e293b', py: 0.75, background: '#f8fbff', fontSize: 12 }}>Presión</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e293b', py: 0.75, background: '#f8fbff', fontSize: 12 }}>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {registros.map((row, index) => (
                      <TableRow key={`${row.fecha}-${row.hora}-${index}`} hover>
                        <TableCell sx={{ py: 0.5, fontSize: 12 }}>{row.fecha}</TableCell>
                        <TableCell sx={{ py: 0.5, fontSize: 12 }}>{row.hora}</TableCell>
                        <TableCell sx={{ py: 0.5, fontSize: 12 }}>{row.nivel}</TableCell>
                        <TableCell sx={{ py: 0.5, fontSize: 12 }}>{row.presion}</TableCell>
                        <TableCell sx={{ py: 0.5, fontSize: 12 }}>
                          <Chip
                            label={row.estado}
                            size="small"
                            sx={{
                              background: row.estado === 'Nivel Bajo' ? '#fee2e2' : row.estado === 'Atención' ? '#fef3c7' : row.estado === 'Nivel Alto' ? '#dcfce7' : '#dbeafe',
                              color: row.estado === 'Nivel Bajo' ? '#b91c1c' : row.estado === 'Atención' ? '#a16207' : row.estado === 'Nivel Alto' ? '#166534' : '#1d4ed8',
                              fontWeight: 700,
                              fontSize: 11,
                              height: 22,
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}
          </Paper>

          <Paper elevation={0} sx={{ background: '#fff', borderRadius: '18px', border: '1px solid #e7edf5', boxShadow: '0 6px 12px rgba(15, 23, 42, 0.03)', p: 2 }}>
            <Typography sx={{ fontWeight: 800, color: '#123c6b', fontSize: 14, mb: 1, textAlign: 'center' }}>Estado Actual y Resumen</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
              {summaryCards.map((stat) => (
                <Box key={stat.label} sx={{ flex: '1 1 0', textAlign: 'center', px: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#55657e' }}>{stat.label}</Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#123c6b', mt: 0.5 }}>{stat.value}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Box>
      </Box>

      <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        <Typography sx={{ color: "#64748b", fontSize: 12 }}>
          Tanques cargados: {tanks.length} · Fecha activa: {fechaSeleccionada} · Período: {selectedPeriod}
        </Typography>
      </Box>
    </Box>
  );
}

export default Historicos;
