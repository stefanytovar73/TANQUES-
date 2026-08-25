import { useEffect, useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Box,
    Typography,
    Divider,
    Chip,
} from "@mui/material";

// Estados del control de tamano:
// null        -> solo boton "Tamano"
// "choose"    -> mostrar [−] [+]
// "minus"     -> mostrar [Alto] [Ancho] para reducir
// "plus"      -> mostrar [Alto] [Ancho] para aumentar

function TankConfigDialog({ open, onClose, catalogEntry, onSave }) {
    const [form, setForm] = useState({
        area_m2: "",
        altura_rebose: "",
        altura_total: "",
        volumen: "",
        largo: "",
        ancho: "",
        compartimientos: "",
        cota_entrada: "",
        cota_salida: "",
        cota_fondo: "",
        cota_rebose: "",
        altura_rebose_calibrada: "",
        capacidad_maxima_m3: "",
        capacidad_actual_m3: "",
        volumen_restante_m3: "",
        nivel_maximo: "",
    });

    // Estado del control de tamano
    const [sizeMode, setSizeMode] = useState(null);

    useEffect(() => {
        if (catalogEntry) {
            setForm({
                area_m2: catalogEntry.area_m2 != null ? String(catalogEntry.area_m2) : "",
                altura_rebose: catalogEntry.altura_rebose != null ? String(catalogEntry.altura_rebose) : "",
                altura_total: catalogEntry.altura_total != null ? String(catalogEntry.altura_total) : "",
                volumen: catalogEntry.volumen != null ? String(catalogEntry.volumen) : "",
                largo: catalogEntry.largo != null ? String(catalogEntry.largo) : "",
                ancho: catalogEntry.ancho != null ? String(catalogEntry.ancho) : "",
                compartimientos: catalogEntry.compartimientos != null ? String(catalogEntry.compartimientos) : "",
                cota_entrada: catalogEntry.cota_entrada != null ? String(catalogEntry.cota_entrada) : "",
                cota_salida: catalogEntry.cota_salida != null ? String(catalogEntry.cota_salida) : "",
                cota_fondo: catalogEntry.cota_fondo != null ? String(catalogEntry.cota_fondo) : "",
                cota_rebose: catalogEntry.cota_rebose != null ? String(catalogEntry.cota_rebose) : "",
                altura_rebose_calibrada: catalogEntry.altura_rebose_calibrada != null ? String(catalogEntry.altura_rebose_calibrada) : "",
                capacidad_maxima_m3: catalogEntry.capacidad_maxima_m3 != null ? String(catalogEntry.capacidad_maxima_m3) : "",
                capacidad_actual_m3: catalogEntry.capacidad_actual_m3 != null ? String(catalogEntry.capacidad_actual_m3) : "",
                volumen_restante_m3: catalogEntry.volumen_restante_m3 != null ? String(catalogEntry.volumen_restante_m3) : "",
                nivel_maximo: catalogEntry.nivel_maximo != null ? String(catalogEntry.nivel_maximo) : "",
            });
        } else {
            setForm({
                area_m2: "",
                altura_rebose: "",
                altura_total: "",
                volumen: "",
                largo: "",
                ancho: "",
                compartimientos: "",
                cota_entrada: "",
                cota_salida: "",
                cota_fondo: "",
                cota_rebose: "",
                altura_rebose_calibrada: "",
                capacidad_maxima_m3: "",
                capacidad_actual_m3: "",
                volumen_restante_m3: "",
                nivel_maximo: "",
            });
        }
        setSizeMode(null);
    }, [catalogEntry, open]);

    const handleChange = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleStep = (field, direction, step = 0.1) => {
        setForm((prev) => {
            const current = prev[field] === "" ? 0 : Number(prev[field]);
            if (!Number.isFinite(current)) return prev;
            const next = Math.round((current + direction * step) * 1e9) / 1e9;
            return { ...prev, [field]: String(next < 0 ? 0 : next) };
        });
    };

    // Aplica el ajuste de tamano y regresa al inicio
    const applySize = (dimension) => {
        const direction = sizeMode === "plus" ? +1 : -1;
        const field = dimension === "alto" ? "altura_total" : "ancho";
        handleStep(field, direction, 0.1);
        setSizeMode(null);
    };

    const toNumberOrNull = (value) => (value === "" ? null : Number(value));

    const handleSubmit = () => {
        onSave({
            area_m2: toNumberOrNull(form.area_m2),
            altura_rebose: toNumberOrNull(form.altura_rebose),
            altura_rebose_calibrada: toNumberOrNull(form.altura_rebose_calibrada),
            altura_total: toNumberOrNull(form.altura_total),
            volumen: toNumberOrNull(form.volumen),
            largo: toNumberOrNull(form.largo),
            ancho: toNumberOrNull(form.ancho),
            compartimientos: toNumberOrNull(form.compartimientos),
            cota_entrada: toNumberOrNull(form.cota_entrada),
            cota_salida: toNumberOrNull(form.cota_salida),
            cota_fondo: toNumberOrNull(form.cota_fondo),
            cota_rebose: toNumberOrNull(form.cota_rebose),
            capacidad_maxima_m3: toNumberOrNull(form.capacidad_maxima_m3),
            capacidad_actual_m3: toNumberOrNull(form.capacidad_actual_m3),
            volumen_restante_m3: toNumberOrNull(form.volumen_restante_m3),
            nivel_maximo: toNumberOrNull(form.nivel_maximo),
        });
    };

    // Boton con estilo comun
    const SzBtn = ({ children, onClick, color = "#0F2A55", bg = "#F8FAFC", border = "#CBD5E1", width = "auto" }) => (
        <Button
            variant="outlined"
            size="small"
            onClick={onClick}
            sx={{
                minWidth: width,
                px: 2,
                height: 38,
                fontSize: 13,
                fontWeight: 700,
                borderColor: border,
                color: color,
                background: bg,
                textTransform: "none",
                borderRadius: "10px",
                "&:hover": { borderColor: "#94A3B8", background: "#EFF6FF" },
            }}
        >
            {children}
        </Button>
    );

    // Panel de control de tamano con animacion por pasos
    const SizeControl = () => (
        <Box
            sx={{
                gridColumn: "1 / -1",
                p: 1.5,
                borderRadius: "12px",
                border: "1.5px dashed #CBD5E1",
                background: "#F8FAFC",
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
                minHeight: 56,
            }}
        >
            {/* Paso 0: solo boton "Tamano" */}
            {sizeMode === null && (
                <SzBtn onClick={() => setSizeMode("choose")}>
                    Tamano
                </SzBtn>
            )}

            {/* Paso 1: elegir - o + */}
            {sizeMode === "choose" && (
                <>
                    <Typography sx={{ fontSize: 12, color: "#64748B", fontWeight: 600, mr: 0.5 }}>
                        Ajustar tamano:
                    </Typography>
                    <SzBtn color="#B91C1C" border="#FCA5A5" bg="#FEF2F2" onClick={() => setSizeMode("minus")} width={42}>
                        −
                    </SzBtn>
                    <SzBtn color="#15803D" border="#86EFAC" bg="#F0FDF4" onClick={() => setSizeMode("plus")} width={42}>
                        +
                    </SzBtn>
                    <SzBtn color="#64748B" border="#E2E8F0" onClick={() => setSizeMode(null)} width={42}>
                        ✕
                    </SzBtn>
                </>
            )}

            {/* Paso 2a: reducir — elegir Alto o Ancho */}
            {sizeMode === "minus" && (
                <>
                    <Typography sx={{ fontSize: 12, color: "#B91C1C", fontWeight: 700, mr: 0.5 }}>
                        − Reducir:
                    </Typography>
                    <SzBtn color="#B91C1C" border="#FCA5A5" bg="#FEF2F2" onClick={() => applySize("alto")}>
                        Alto
                    </SzBtn>
                    <SzBtn color="#B91C1C" border="#FCA5A5" bg="#FEF2F2" onClick={() => applySize("ancho")}>
                        Ancho
                    </SzBtn>
                    <SzBtn color="#64748B" border="#E2E8F0" onClick={() => setSizeMode("choose")} width={42}>
                        ←
                    </SzBtn>
                </>
            )}

            {/* Paso 2b: aumentar — elegir Alto o Ancho */}
            {sizeMode === "plus" && (
                <>
                    <Typography sx={{ fontSize: 12, color: "#15803D", fontWeight: 700, mr: 0.5 }}>
                        + Aumentar:
                    </Typography>
                    <SzBtn color="#15803D" border="#86EFAC" bg="#F0FDF4" onClick={() => applySize("alto")}>
                        Alto
                    </SzBtn>
                    <SzBtn color="#15803D" border="#86EFAC" bg="#F0FDF4" onClick={() => applySize("ancho")}>
                        Ancho
                    </SzBtn>
                    <SzBtn color="#64748B" border="#E2E8F0" onClick={() => setSizeMode("choose")} width={42}>
                        ←
                    </SzBtn>
                </>
            )}
        </Box>
    );

    const StepField = ({ label, field, step = 0.1, helperText }) => (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#64748B", mb: 0.25 }}>
                {label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
                <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleStep(field, -1, step)}
                    sx={{
                        minWidth: 36,
                        px: 0,
                        height: 40,
                        fontSize: 20,
                        fontWeight: 700,
                        lineHeight: 1,
                        borderColor: "#CBD5E1",
                        color: "#0F2A55",
                        flexShrink: 0,
                    }}
                >
                    -
                </Button>
                <TextField
                    type="number"
                    value={form[field]}
                    onChange={handleChange(field)}
                    size="small"
                    helperText={helperText}
                    inputProps={{ style: { textAlign: "center" } }}
                    sx={{ flex: 1 }}
                />
                <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleStep(field, +1, step)}
                    sx={{
                        minWidth: 36,
                        px: 0,
                        height: 40,
                        fontSize: 20,
                        fontWeight: 700,
                        lineHeight: 1,
                        borderColor: "#CBD5E1",
                        color: "#0F2A55",
                        flexShrink: 0,
                    }}
                >
                    +
                </Button>
            </Box>
        </Box>
    );

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Editar configuracion de tanque</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2, mt: 1 }}>
                    {/* Control rapido de tamano (ocupa toda la fila) */}
                    <SizeControl />

                    <StepField label="Area del tanque (m2)" field="area_m2" step={0.1} />
                    <StepField label="Altura de rebose (m)" field="altura_rebose" step={0.01} />
                    <StepField label="Altura total (m)" field="altura_total" step={0.01} />
                    <StepField label="Volumen (m3)" field="volumen" step={0.1} />
                    <StepField label="Largo (m)" field="largo" step={0.1} />
                    <StepField label="Ancho (m)" field="ancho" step={0.1} />
                    <StepField label="Compartimientos" field="compartimientos" step={1} />
                    <StepField label="Cota entrada (m)" field="cota_entrada" step={0.01} />
                    <StepField label="Cota salida (m)" field="cota_salida" step={0.01} />
                    <StepField label="Cota fondo (m)" field="cota_fondo" step={0.01} />
                    <StepField label="Cota rebose (m)" field="cota_rebose" step={0.01} />
                    <StepField
                        label="Altura rebose calibrada (m)"
                        field="altura_rebose_calibrada"
                        step={0.01}
                        helperText="Opcional, reemplaza altura_rebose"
                    />
                    <StepField label="Capacidad maxima (m3)" field="capacidad_maxima_m3" step={0.1} />
                    <StepField label="Capacidad actual (m3)" field="capacidad_actual_m3" step={0.1} />
                    <StepField label="Rebose disponible (m3)" field="volumen_restante_m3" step={0.1} />
                    <StepField label="Nivel maximo (m)" field="nivel_maximo" step={0.01} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button onClick={handleSubmit} variant="contained">
                    Guardar
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default TankConfigDialog;
