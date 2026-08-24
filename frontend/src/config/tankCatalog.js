import { TANQUES_CONFIG } from "./tanquesConfig.js";
import { calcPorcentaje, calculatePorcentaje } from "../utils/tanqueMetrics.js";
import ALTURAS_REBOSE_CALIBRADAS from "./calibrations.js";

const STORAGE_KEY = "ibal-tanques:tankCatalog";

const normalizeText = (value) => {
    if (!value) return "";
    return value
        .toString()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, "")
        .trim();
};

const parseNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
};

const getTankStableId = (tankLike) => {
    if (!tankLike) return "";
    if (tankLike.id != null && String(tankLike.id).length) return normalizeText(String(tankLike.id));
    if (tankLike.tag != null && String(tankLike.tag).length) return normalizeText(String(tankLike.tag));
    const name = tankLike.display_name || tankLike.nombre || tankLike.name || "";
    return normalizeText(name);
};

const buildCatalogEntry = (item) => {
    const displayName = item.display_name || (item.aliases && item.aliases[0]) || "";
    const normalizedAliases = [displayName, item.tag, ...(item.aliases || [])].map(normalizeText).filter(Boolean);
    const area = parseNumber(item.area);
    const alturaRebose = parseNumber(item.altura_rebose);
    const alturaReboseCalibrada = parseNumber(item.altura_rebose_calibrada);
    const alturaTotal = parseNumber(item.altura_total);
    const volumen = parseNumber(item.volumen);
    const largo = parseNumber(item.largo);
    const ancho = parseNumber(item.ancho);
    const compartimientos = Number.isFinite(Number(item.compartimientos)) ? Number(item.compartimientos) : null;
    const cotaEntrada = parseNumber(item.cota_entrada);
    const cotaSalida = parseNumber(item.cota_salida);
    const cotaFondo = parseNumber(item.cota_fondo);
    const cotaRebose = parseNumber(item.cota_rebose);
    const capacidadFromVolume = parseNumber(item.volumen);
    const capacidadFromArea = area != null && alturaRebose != null ? area * alturaRebose : null;
    const capacidadMaxima = capacidadFromVolume != null ? capacidadFromVolume : capacidadFromArea;

    return {
        id: getTankStableId(item) || normalizeText(displayName),
        nombre: displayName,
        display_name: displayName,
        aliases: normalizedAliases,
        area_m2: area,
        altura_rebose: alturaRebose,
        altura_rebose_calibrada: alturaReboseCalibrada,
        altura_total: alturaTotal,
        volumen: volumen,
        largo: largo,
        ancho: ancho,
        compartimientos: compartimientos,
        cota_entrada: cotaEntrada,
        cota_salida: cotaSalida,
        cota_fondo: cotaFondo,
        cota_rebose: cotaRebose,
        nivel_maximo: null,
        capacidad_actual_m3: null,
        capacidad_maxima_m3: Number.isFinite(capacidadMaxima) ? capacidadMaxima : null,
        volumen_restante_m3: null,
    };
};

const DEFAULT_CATALOG = TANQUES_CONFIG.map(buildCatalogEntry);

const loadCatalog = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_CATALOG;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return DEFAULT_CATALOG;
        return parsed.map((item) => {
            // keep configurable capacity fields (capacidad_actual_m3, volumen_restante_m3)
            const { porcentaje, nivel, valor_m, ...cleanedItem } = item;
            return {
                ...cleanedItem,
                id: getTankStableId(cleanedItem) || normalizeText(cleanedItem.nombre),
                aliases: Array.isArray(cleanedItem.aliases) ? cleanedItem.aliases.map(normalizeText) : [normalizeText(cleanedItem.nombre)],
                area_m2: parseNumber(cleanedItem.area_m2),
                altura_rebose: parseNumber(cleanedItem.altura_rebose),
                altura_rebose_calibrada: parseNumber(cleanedItem.altura_rebose_calibrada),
                altura_total: parseNumber(cleanedItem.altura_total),
                volumen: parseNumber(cleanedItem.volumen),
                largo: parseNumber(cleanedItem.largo),
                ancho: parseNumber(cleanedItem.ancho),
                compartimientos: Number.isFinite(Number(cleanedItem.compartimientos)) ? Number(cleanedItem.compartimientos) : null,
                cota_entrada: parseNumber(cleanedItem.cota_entrada),
                cota_salida: parseNumber(cleanedItem.cota_salida),
                cota_fondo: parseNumber(cleanedItem.cota_fondo),
                cota_rebose: parseNumber(cleanedItem.cota_rebose),
                nivel_maximo: parseNumber(cleanedItem.nivel_maximo),
                capacidad_actual_m3: parseNumber(cleanedItem.capacidad_actual_m3),
                capacidad_maxima_m3: parseNumber(cleanedItem.capacidad_maxima_m3),
                volumen_restante_m3: parseNumber(cleanedItem.volumen_restante_m3),
            };
        });
    } catch {
        return DEFAULT_CATALOG;
    }
};

const saveCatalog = (catalog) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    } catch (err) {
        console.warn("No se pudo guardar el catálogo de tanques", err);
    }
};

const findCatalogEntry = (tank, catalog = DEFAULT_CATALOG) => {
    if (!tank) return null;
    const normalizeCandidate = (value) => (value != null ? normalizeText(String(value)) : "");
    const normalizeTagCandidate = (value) => {
        if (!value) return "";
        const normalized = normalizeCandidate(String(value).replace(/_/g, " "));
        return normalized.replace(/^nivel\s+/, "");
    };
    const idCandidate = tank.id != null && String(tank.id).length ? normalizeCandidate(tank.id) : null;
    const tagCandidate = tank.tag != null && String(tank.tag).length ? normalizeTagCandidate(tank.tag) : null;
    const nameCandidates = [tank.display_name, tank.nombre, tagCandidate, tank.tag, tank.id != null ? String(tank.id) : null]
        .filter(Boolean)
        .map(normalizeCandidate)
        .filter(Boolean);
    const uniqueNames = [...new Set(nameCandidates)];

    const findByKey = (key) =>
        catalog.find((entry) => entry.id === key || (entry.aliases || []).includes(key));

    if (idCandidate) {
        const byId = findByKey(idCandidate);
        if (byId) return byId;
    }
    if (tagCandidate) {
        const byTag = findByKey(tagCandidate);
        if (byTag) return byTag;
    }

    if (!uniqueNames.length) return null;

    const exactMatch = catalog.find((entry) => uniqueNames.some((name) => entry.id === name || (entry.aliases || []).includes(name)));
    if (exactMatch) return exactMatch;

    const tokens = (s) => (s || "").split(/\s+/).filter(Boolean);
    const numericTokens = (arr) => arr.filter((t) => /^\d+$/.test(t));
    const alphaTokens = (arr) => arr.filter((t) => !/^\d+$/.test(t));
    const tokensEqual = (a, b) => {
        const ta = tokens(a);
        const tb = tokens(b);
        if (ta.length !== tb.length) return false;
        for (let i = 0; i < ta.length; i += 1) {
            if (ta[i] !== tb[i]) return false;
        }
        return true;
    };
    const numericSequenceEqual = (a, b) => {
        const na = numericTokens(tokens(a));
        const nb = numericTokens(tokens(b));
        if (na.length !== nb.length) return false;
        return na.every((token, index) => token === nb[index]);
    };
    const alphaSubset = (a, b) => {
        const aa = alphaTokens(tokens(a));
        const ba = alphaTokens(tokens(b));
        if (!aa.length || !ba.length) return false;
        return aa.every((token) => ba.includes(token));
    };

    // 1) exact token equality for any normalized candidate
    const tokenExact = catalog.find((entry) =>
        (entry.aliases || []).some((alias) => uniqueNames.some((name) => tokensEqual(alias, name)))
    );
    if (tokenExact) return tokenExact;

    // 2) safe numeric-aware matching: require same numeric tokens, then match alpha subset
    const safeMatch = catalog.find((entry) =>
        (entry.aliases || []).some((alias) =>
            uniqueNames.some((name) => {
                const aliasNumeric = numericTokens(tokens(alias));
                const nameNumeric = numericTokens(tokens(name));
                if (aliasNumeric.length && nameNumeric.length) {
                    if (!numericSequenceEqual(alias, name)) return false;
                    return alphaSubset(name, alias) || alphaSubset(alias, name);
                }
                // if either side has no numeric tokens, allow alpha subset match only when one string is a superset of the other
                return alphaSubset(name, alias) || alphaSubset(alias, name);
            })
        )
    );
    return safeMatch || null;
};

const calculateAutomaticPorcentaje = (nivel, altura_rebose) => {
    // Delegate to centralized calculation in tanqueMetrics to ensure a single rule
    return calcPorcentaje(nivel, altura_rebose);
};

// Central function to compute display percentage from raw values using API altura_rebose.
const calculateDisplayPorcentajeFromValues = (nivel, altura_rebose) => {
    const raw = calculateAutomaticPorcentaje(nivel, altura_rebose);
    return raw == null ? null : raw; // raw percentage (0-100), caller rounds
};

// Restore the calibrated local percentage logic that was already working for the tank catalog.
const normalizedCalibrations = Object.fromEntries(
    Object.entries(ALTURAS_REBOSE_CALIBRADAS).map(([k, v]) => [normalizeText(k), v])
);

const resolveCalibratedHeight = (tank) => {
    if (!tank) return null;

    const values = [
        tank.altura_rebose_m,
        tank.altura_rebose_calibrada,
        tank.altura_rebose,
        tank.alturaRebose,
        tank.alturaReboseCalibrada,
    ];

    for (const value of values) {
        if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }

    try {
        const configEntry = findCatalogEntry(tank, DEFAULT_CATALOG);
        if (configEntry && configEntry.altura_rebose_calibrada !== null && configEntry.altura_rebose_calibrada !== undefined && configEntry.altura_rebose_calibrada !== "" && Number.isFinite(Number(configEntry.altura_rebose_calibrada))) {
            return Number(configEntry.altura_rebose_calibrada);
        }
    } catch (e) {
        // ignore and continue with explicit map
    }

    const candidates = [tank.tag, tank.display_name, tank.nombre, tank.id != null ? String(tank.id) : null]
        .filter(Boolean)
        .map(normalizeText);

    for (const c of candidates) {
        if (!c || !Object.prototype.hasOwnProperty.call(normalizedCalibrations, c)) continue;
        const calibrated = normalizedCalibrations[c];
        if (calibrated !== null && calibrated !== undefined && Number.isFinite(Number(calibrated))) {
            return Number(calibrated);
        }
    }

    return null;
};

const calculateDisplayPorcentaje = (tank) => {
    if (!tank) return null;

    const nivel = (tank.valor_m !== null && tank.valor_m !== undefined && tank.valor_m !== "") && Number.isFinite(Number(tank.valor_m)) ? Number(tank.valor_m) : null;
    if (nivel === null) return null;

    const calibratedHeight = resolveCalibratedHeight(tank);
    if (calibratedHeight == null) return null;

    const raw = calculatePorcentaje(nivel, calibratedHeight);
    return raw == null ? null : Math.round(raw);
};

const sanitizeTankForDisplay = (tank) => {
    if (!tank || typeof tank !== "object") return tank;
    const sanitized = { ...tank };
    delete sanitized.porcentaje;
    delete sanitized.porcentaje_capacidad;
    delete sanitized.porcentaje_api;
    delete sanitized.porcentaje_capacidad_api;
    delete sanitized.pct;
    return sanitized;
};

const mergeTankWithCatalog = (tank, catalog) => {
    const sourceTank = sanitizeTankForDisplay(tank);
    const config = findCatalogEntry(sourceTank, catalog);
    const nivelActual = Number.isFinite(Number(sourceTank.valor_m)) ? Number(sourceTank.valor_m) : null;
    const computedAltura = (sourceTank.altura_rebose !== null && sourceTank.altura_rebose !== undefined && sourceTank.altura_rebose !== "") && Number.isFinite(Number(sourceTank.altura_rebose)) ? Number(sourceTank.altura_rebose) : null;
    const calibratedHeight = config?.altura_rebose_calibrada != null && config?.altura_rebose_calibrada !== "" ? Number(config.altura_rebose_calibrada) : resolveCalibratedHeight(sourceTank);
    const shouldUseCalibratedDynamic = calibratedHeight != null && nivelActual != null;
    const computedPorcentaje = shouldUseCalibratedDynamic ? Math.round(calculatePorcentaje(nivelActual, calibratedHeight)) : null;

    const merged = {
        ...sourceTank,
        area_m2: config?.area_m2 ?? sourceTank.area_m2 ?? null,
        altura_rebose: computedAltura,
        altura_rebose_calibrada: calibratedHeight,
        altura_total: config?.altura_total ?? sourceTank.altura_total ?? null,
        volumen: config?.volumen ?? sourceTank.volumen ?? sourceTank.volumen_m3 ?? null,
        largo: config?.largo ?? sourceTank.largo ?? null,
        ancho: config?.ancho ?? sourceTank.ancho ?? null,
        compartimientos: config?.compartimientos ?? sourceTank.compartimientos ?? null,
        cota_entrada: config?.cota_entrada ?? sourceTank.cota_entrada ?? null,
        cota_salida: config?.cota_salida ?? sourceTank.cota_salida ?? null,
        cota_fondo: config?.cota_fondo ?? sourceTank.cota_fondo ?? null,
        cota_rebose: config?.cota_rebose ?? sourceTank.cota_rebose ?? null,
        nivel_maximo: config?.nivel_maximo ?? sourceTank.nivel_maximo ?? null,
        capacidad_actual_m3: config?.capacidad_actual_m3 ?? sourceTank.capacidad_actual_m3 ?? sourceTank.capacidad_actual ?? null,
        capacidad_maxima_m3: config?.capacidad_maxima_m3 ?? sourceTank.capacidad_maxima_m3 ?? sourceTank.capacidad_maxima ?? null,
        volumen_restante_m3: config?.volumen_restante_m3 ?? sourceTank.volumen_restante_m3 ?? sourceTank.rebose ?? null,
        display_name: config?.display_name ?? sourceTank.display_name ?? sourceTank.nombre ?? sourceTank.tag ?? null,
        porcentaje_api: Number.isFinite(Number(sourceTank.porcentaje)) ? Number(sourceTank.porcentaje) : null,
        porcentaje_capacidad_api: Number.isFinite(Number(sourceTank.porcentaje_capacidad)) ? Number(sourceTank.porcentaje_capacidad) : null,
        porcentaje: computedPorcentaje,
        nivel: nivelActual,
        valor_m: sourceTank.valor_m,
    };

    return merged;
};

const mergeApiTanquesWithCatalog = (apiTanques, catalog) => {
    if (!Array.isArray(apiTanques)) {
        return [];
    }
    return apiTanques.map((tank) => mergeTankWithCatalog(sanitizeTankForDisplay(tank), catalog));
};

const updateCatalogEntry = (catalog, id, updates) => {
    const normalizedId = id ? normalizeText(id) : "";
    const existing = normalizedId
        ? catalog.find((item) => item.id === normalizedId || item.aliases.includes(normalizedId))
        : null;
    const normalizedUpdates = {
        ...updates,
        area_m2: parseNumber(updates.area_m2),
        altura_rebose: parseNumber(updates.altura_rebose),
        altura_rebose_calibrada: parseNumber(updates.altura_rebose_calibrada),
        altura_total: parseNumber(updates.altura_total),
        volumen: parseNumber(updates.volumen),
        largo: parseNumber(updates.largo),
        ancho: parseNumber(updates.ancho),
        compartimientos: Number.isFinite(Number(updates.compartimientos)) ? Number(updates.compartimientos) : null,
        cota_entrada: parseNumber(updates.cota_entrada),
        cota_salida: parseNumber(updates.cota_salida),
        cota_fondo: parseNumber(updates.cota_fondo),
        cota_rebose: parseNumber(updates.cota_rebose),
        nivel_maximo: parseNumber(updates.nivel_maximo),
        capacidad_actual_m3: parseNumber(updates.capacidad_actual_m3),
        capacidad_maxima_m3: parseNumber(updates.capacidad_maxima_m3),
        volumen_restante_m3: parseNumber(updates.volumen_restante_m3),
    };

    if (existing) {
        return catalog.map((item) => {
            if (item.id !== existing.id) return item;
            const cleanedItem = { ...item };
            delete cleanedItem.nivel;
            delete cleanedItem.porcentaje;
            delete cleanedItem.valor_m;
            const merged = { ...cleanedItem, ...normalizedUpdates };
            // ensure aliases are normalized and include the id/display name
            const baseAliases = Array.isArray(merged.aliases) ? merged.aliases.map(normalizeText) : [];
            const displayAlias = normalizeText(merged.display_name || merged.nombre || "");
            const idAlias = normalizeText(merged.nombre || merged.id || "");
            const aliases = Array.from(new Set([displayAlias, idAlias, ...baseAliases].filter(Boolean)));
            return { ...merged, aliases };
        });
    }

    const newId = normalizedId || normalizeText(normalizedUpdates.display_name || normalizedUpdates.nombre || id || "");
    const newEntry = {
        id: newId,
        nombre: normalizedUpdates.nombre || id || newId,
        display_name: normalizedUpdates.display_name || normalizedUpdates.nombre || id || newId,
        aliases: [normalizeText(normalizedUpdates.display_name || normalizedUpdates.nombre || id || newId)],
        area_m2: normalizedUpdates.area_m2,
        altura_rebose: normalizedUpdates.altura_rebose,
        altura_rebose_calibrada: normalizedUpdates.altura_rebose_calibrada,
        altura_total: normalizedUpdates.altura_total,
        volumen: normalizedUpdates.volumen,
        largo: normalizedUpdates.largo,
        ancho: normalizedUpdates.ancho,
        compartimientos: normalizedUpdates.compartimientos,
        cota_entrada: normalizedUpdates.cota_entrada,
        cota_salida: normalizedUpdates.cota_salida,
        cota_fondo: normalizedUpdates.cota_fondo,
        cota_rebose: normalizedUpdates.cota_rebose,
        nivel_maximo: normalizedUpdates.nivel_maximo,
        capacidad_actual_m3: normalizedUpdates.capacidad_actual_m3,
        capacidad_maxima_m3: normalizedUpdates.capacidad_maxima_m3,
        volumen_restante_m3: normalizedUpdates.volumen_restante_m3,
    };
    return [...catalog, newEntry];
};

export {
    DEFAULT_CATALOG,
    loadCatalog,
    saveCatalog,
    mergeApiTanquesWithCatalog,
    updateCatalogEntry,
    normalizeText,
    findCatalogEntry,
    calculateAutomaticPorcentaje,
    calculateDisplayPorcentaje,
    calculateDisplayPorcentajeFromValues,
};
