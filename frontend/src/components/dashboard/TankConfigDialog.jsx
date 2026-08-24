import { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Box, Typography } from "@mui/material";

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
    }, [catalogEntry]);

    const handleChange = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
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

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Editar configuración de tanque</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2, mt: 1 }}>
                    <TextField
                        label="Área del tanque (m²)"
                        type="number"
                        value={form.area_m2}
                        onChange={handleChange("area_m2")}
                        fullWidth
                    />
                    <TextField
                        label="Altura de rebose (m)"
                        type="number"
                        value={form.altura_rebose}
                        onChange={handleChange("altura_rebose")}
                        fullWidth
                    />
                    <TextField
                        label="Altura total (m)"
                        type="number"
                        value={form.altura_total}
                        onChange={handleChange("altura_total")}
                        fullWidth
                    />
                    <TextField
                        label="Volumen (m³)"
                        type="number"
                        value={form.volumen}
                        onChange={handleChange("volumen")}
                        fullWidth
                    />
                    <TextField
                        label="Largo (m)"
                        type="number"
                        value={form.largo}
                        onChange={handleChange("largo")}
                        fullWidth
                    />
                    <TextField
                        label="Ancho (m)"
                        type="number"
                        value={form.ancho}
                        onChange={handleChange("ancho")}
                        fullWidth
                    />
                    <TextField
                        label="Compartimientos"
                        type="number"
                        value={form.compartimientos}
                        onChange={handleChange("compartimientos")}
                        fullWidth
                    />
                    <TextField
                        label="Cota entrada (m)"
                        type="number"
                        value={form.cota_entrada}
                        onChange={handleChange("cota_entrada")}
                        fullWidth
                    />
                    <TextField
                        label="Cota salida (m)"
                        type="number"
                        value={form.cota_salida}
                        onChange={handleChange("cota_salida")}
                        fullWidth
                    />
                    <TextField
                        label="Cota fondo (m)"
                        type="number"
                        value={form.cota_fondo}
                        onChange={handleChange("cota_fondo")}
                        fullWidth
                    />
                    <TextField
                        label="Cota rebose (m)"
                        type="number"
                        value={form.cota_rebose}
                        onChange={handleChange("cota_rebose")}
                        fullWidth
                    />
                    <TextField
                        label="Altura de rebose calibrada (m)"
                        type="number"
                        value={form.altura_rebose_calibrada}
                        onChange={handleChange("altura_rebose_calibrada")}
                        helperText="Valor opcional que reemplaza 'altura_rebose' para calcular porcentaje"
                        fullWidth
                    />
                    <TextField
                        label="Capacidad máxima (m³)"
                        type="number"
                        value={form.capacidad_maxima_m3}
                        onChange={handleChange("capacidad_maxima_m3")}
                        fullWidth
                    />
                    <TextField
                        label="Capacidad actual (m³)"
                        type="number"
                        value={form.capacidad_actual_m3}
                        onChange={handleChange("capacidad_actual_m3")}
                        fullWidth
                    />
                    <TextField
                        label="Rebose disponible (m³)"
                        type="number"
                        value={form.volumen_restante_m3}
                        onChange={handleChange("volumen_restante_m3")}
                        fullWidth
                    />
                    <TextField
                        label="Nivel máximo (m)"
                        type="number"
                        value={form.nivel_maximo}
                        onChange={handleChange("nivel_maximo")}
                        fullWidth
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button onClick={handleSubmit} variant="contained">Guardar</Button>
            </DialogActions>
        </Dialog>
    );
}

export default TankConfigDialog;
