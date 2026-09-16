import { TANQUES_CONFIG } from "./tanquesConfig.js";
import { calcPorcentaje, calculatePorcentaje } from "../utils/tanqueMetrics.js";

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

let _DEFAULT_CATALOG = null;
const getDefaultCatalog = () => {
    if (_DEFAULT_CATALOG) return _DEFAULT_CATALOG;
    _DEFAULT_CATALOG = TANQUES_CONFIG.map(buildCatalogEntry);
    return _DEFAULT_CATALOG;
};

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
        return getDefaultCatalog();
    }
};

const saveCatalog = (catalog) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    } catch (err) {
        console.warn("No se pudo guardar el catálogo de tanques", err);
    }
};

const findCatalogEntry = (tank, catalog = null) => {
    if (!catalog) catalog = getDefaultCatalog();
    if (!tank) return null;
    const normalizeCandidate = (value) => (value != null ? normalizeText(String(value)) : "");
    const normalizeTagCandidate = (value) => {
        if (!value) return "";
        const normalized = normalizeCandidate(String(value).replace(/_/g, " "));
        return normalized
            .replace(/^nivel\s+/, "")
            .replace(/^de\s+/, "");
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

const ZERO_PERCENT_EXCEPTION_TANKS = new Set([
    'tanque-calucaima',
    'tanque-miramar',
    'tanque-zona-industrial',
    'nivel-calucaima',
    'nivel-miramar',
    'nivel-de-zona-industrial',
    'calucaima',
    'miramar',
    'zona industrial',
]);

const isZeroPercentExceptionTank = (tank = {}) => {
    const candidates = [
        tank.id,
        tank.tag,
        tank.apiTag,
        tank.apiName,
        tank.originalName,
        tank.nombre,
        tank.display_name,
        tank.label,
        tank.name,
    ].filter((value) => value != null && String(value).trim() !== '');

    if (!candidates.length) return false;

    const normalized = candidates
        .map((value) => String(value).trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())
        .join(' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return false;
    return Array.from(ZERO_PERCENT_EXCEPTION_TANKS).some((token) => normalized.includes(token));
};

const isUsableExplicitPercentage = (tank = {}, value) => {
    if (value === null || value === undefined || value === '') return false;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;

    if (numeric !== 0) return true;
    if (!isZeroPercentExceptionTank(tank)) return true;

    const nivel = Number.isFinite(Number(tank.valor_m)) ? Number(tank.valor_m)
        : (Number.isFinite(Number(tank.nivel)) ? Number(tank.nivel) : null);
    const altura = Number.isFinite(Number(tank.altura_rebose_calibrada)) ? Number(tank.altura_rebose_calibrada)
        : (Number.isFinite(Number(tank.altura_rebose_m)) ? Number(tank.altura_rebose_m)
            : (Number.isFinite(Number(tank.altura_rebose)) ? Number(tank.altura_rebose) : null));

    return !(nivel != null && nivel > 0 && altura != null && altura > 0);
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

const calculateDisplayPorcentaje = (tank, explicitHeight = null) => {
    if (tank == null) return null;

    if (typeof tank === "number" || typeof tank === "string") {
        const nivel = parseNumber(tank);
        if (nivel == null) return null;
        const altura = parseNumber(explicitHeight);
        if (altura == null || altura <= 0) return null;
        const raw = calculatePorcentaje(nivel, altura);
        return raw == null ? null : Math.round(raw);
    }

    // porcentaje_capacidad es autoritativo cuando IBAL incluye el campo,
    // incluso cuando su valor es null. No inventar un porcentaje local en ese caso.
    if (Object.prototype.hasOwnProperty.call(tank, "porcentaje_capacidad")) {
        const value = tank.porcentaje_capacidad;
        return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
            ? Number(value)
            : null;
    }

    if (Object.prototype.hasOwnProperty.call(tank, "porcentaje_capacidad_api")) {
        const value = tank.porcentaje_capacidad_api;
        return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
            ? Number(value)
            : null;
    }

    if (Object.prototype.hasOwnProperty.call(tank, "porcentaje_api")) {
        const value = tank.porcentaje_api;
        return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
            ? Number(value)
            : null;
    }

    const legacyPercentage = [tank.porcentaje, tank.pct]
        .find((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
    if (legacyPercentage !== undefined) {
        return Number(legacyPercentage);
    }

    const nivel = (tank.valor_m !== null && tank.valor_m !== undefined && tank.valor_m !== "") && Number.isFinite(Number(tank.valor_m)) ? Number(tank.valor_m)
        : ((tank.nivel !== null && tank.nivel !== undefined && tank.nivel !== "") && Number.isFinite(Number(tank.nivel)) ? Number(tank.nivel) : null);
    if (nivel === null) return null;

    // Regla: Si la API no aporta un porcentaje fiable, calcular con (valor_m / altura_rebose)
    // usando la altura calibrada o la del catálogo, manteniendo 0 como valor válido.
    const providedHeight = explicitHeight ?? tank.altura_rebose ?? tank.altura_rebose_m ?? tank.altura_rebose_calibrada ?? tank.alturaRebose ?? null;
    if (providedHeight === null || providedHeight === undefined || providedHeight === "") return null;
    if (!Number.isFinite(Number(providedHeight))) return null;

    const rawHeight = Number(providedHeight);
    if (rawHeight <= 0) return null;

    const computed = calculatePorcentaje(nivel, rawHeight);
    if (computed == null) return null;
    return Math.round(computed);
};

const sanitizeTankForDisplay = (tank) => {
    if (!tank || typeof tank !== "object") return tank;
    const sanitized = { ...tank };
    // Preservar los valores raw de la API antes de limpiar campos calculados previos.
    // porcentaje_capacidad es el campo real que devuelve IBAL; NO borrarlo si no hay porcentaje ya computado.
    const rawPorcentajeCapacidad = Number.isFinite(Number(sanitized.porcentaje_capacidad)) ? Number(sanitized.porcentaje_capacidad) : null;
    delete sanitized.porcentaje;
    delete sanitized.porcentaje_api;
    delete sanitized.porcentaje_capacidad_api;
    delete sanitized.pct;
    // Restaurar porcentaje_capacidad si existía, para que mergeTankWithCatalog lo pueda leer
    if (rawPorcentajeCapacidad != null) sanitized.porcentaje_capacidad = rawPorcentajeCapacidad;
    return sanitized;
};

const mergeTankWithCatalog = (tank, catalog) => {
    const sourceTank = sanitizeTankForDisplay(tank);
    // First try a strict match by normalized tag/id to prefer identity-stable mapping
    const tryStrictMatch = () => {
        try {
            const tag = sourceTank.tag || sourceTank.apiTag || sourceTank.tag_raw || null;
            if (tag) {
                const normalizedTag = normalizeText(String(tag).replace(/[_-]+/g, ' ').replace(/^nivel\s+/i, ''));
                const byId = catalog.find((entry) => entry.id === normalizedTag || (entry.aliases || []).includes(normalizedTag));
                if (byId) return byId;
            }
            const idCandidate = sourceTank.id != null && String(sourceTank.id).length ? normalizeText(String(sourceTank.id)) : null;
            if (idCandidate) {
                const byId2 = catalog.find((entry) => entry.id === idCandidate || (entry.aliases || []).includes(idCandidate));
                if (byId2) return byId2;
            }
        } catch (e) { /* ignore */ }
        return null;
    };

    const strictConfig = tryStrictMatch();
    const config = strictConfig || findCatalogEntry(sourceTank, catalog);
    const nivelActual = Number.isFinite(Number(sourceTank.valor_m)) ? Number(sourceTank.valor_m) : null;

    // Prioridad de altura_rebose:
    //  1. config.altura_rebose_calibrada  ← coincide con el porcentaje que muestra IBAL
    //  2. config.altura_rebose            ← valor del catálogo sin calibrar
    //  3. API altura_rebose_m             ← raw del sensor (útil solo cuando no hay catálogo)
    //  4. API altura_rebose               ← último recurso
    // Prefer catalog calibrated height when available (identity-stable mapping ensured above)
    const rawAltura = (config?.altura_rebose_calibrada != null && Number.isFinite(Number(config.altura_rebose_calibrada)))
        ? Number(config.altura_rebose_calibrada)
        : ((config?.altura_rebose != null && Number.isFinite(Number(config.altura_rebose)))
            ? Number(config.altura_rebose)
            : ((sourceTank.altura_rebose_m !== null && sourceTank.altura_rebose_m !== undefined && sourceTank.altura_rebose_m !== '') && Number.isFinite(Number(sourceTank.altura_rebose_m))
                ? Number(sourceTank.altura_rebose_m)
                : ((sourceTank.altura_rebose !== null && sourceTank.altura_rebose !== undefined && sourceTank.altura_rebose !== '') && Number.isFinite(Number(sourceTank.altura_rebose))
                    ? Number(sourceTank.altura_rebose) : null)));

    const isBadQuality = sourceTank.calidad === 'DUDOSA' || sourceTank.sin_datos === true;

    // An explicit percentage from IBAL is valid even if the API marks the signal as DUDOSA.
    // We only hide the metric when the source is totally missing both the percentage and the data needed to compute it.
    const apiPorcentaje = [
        sourceTank.porcentaje_capacidad,
        sourceTank.porcentaje_capacidad_api,
        sourceTank.porcentaje_api,
        sourceTank.porcentaje,
    ].find((value) => isUsableExplicitPercentage(sourceTank, value));
    const hasExplicitPercentage = apiPorcentaje !== undefined;

    const catalogHasCalibratedHeight = config != null && (
        (config.altura_rebose_calibrada != null && Number.isFinite(Number(config.altura_rebose_calibrada))) ||
        (config.altura_rebose != null && Number.isFinite(Number(config.altura_rebose))) ||
        (config.alturaRebose != null && Number.isFinite(Number(config.alturaRebose)))
    );

    let computedPorcentaje;
    if (hasExplicitPercentage) {
        computedPorcentaje = Number(apiPorcentaje);
    } else if (catalogHasCalibratedHeight && !isBadQuality && nivelActual != null && rawAltura != null && rawAltura > 0) {
        const alturaUsar = (config && config.altura_rebose_calibrada != null && Number.isFinite(Number(config.altura_rebose_calibrada))) ? Number(config.altura_rebose_calibrada) : rawAltura;
        const raw = calculateDisplayPorcentaje(nivelActual, alturaUsar);
        computedPorcentaje = (raw == null) ? null : Math.round(raw);
    } else if (!isBadQuality && nivelActual != null && rawAltura != null && rawAltura > 0) {
        const raw = calculateDisplayPorcentaje(nivelActual, rawAltura);
        computedPorcentaje = (raw == null) ? null : Math.round(raw);
    } else {
        computedPorcentaje = null;
    }

    return {
        ...sourceTank,
        area_m2: sourceTank.area_m2 ?? config?.area_m2 ?? null,
        altura_rebose: rawAltura,
        // Preservar también con clave _m para compatibilidad
        altura_rebose_m: rawAltura ?? sourceTank.altura_rebose_m ?? null,
        altura_rebose_calibrada: sourceTank.altura_rebose_calibrada ?? rawAltura ?? null,
        altura_total: sourceTank.altura_total ?? config?.altura_total ?? null,
        volumen: sourceTank.volumen ?? sourceTank.volumen_m3 ?? config?.volumen ?? null,
        largo: sourceTank.largo ?? config?.largo ?? null,
        ancho: sourceTank.ancho ?? config?.ancho ?? null,
        compartimientos: sourceTank.compartimientos ?? config?.compartimientos ?? null,
        cota_entrada: sourceTank.cota_entrada ?? config?.cota_entrada ?? null,
        cota_salida: sourceTank.cota_salida ?? config?.cota_salida ?? null,
        cota_fondo: sourceTank.cota_fondo ?? config?.cota_fondo ?? null,
        cota_rebose: sourceTank.cota_rebose ?? config?.cota_rebose ?? null,
        nivel_maximo: sourceTank.nivel_maximo ?? config?.nivel_maximo ?? null,
        // La API IBAL usa capacidad_m3 — mapear a los campos estándar
        capacidad_actual_m3: sourceTank.capacidad_actual_m3 ?? sourceTank.capacidad_actual ?? sourceTank.capacidad_m3 ?? config?.capacidad_actual_m3 ?? null,
        capacidad_maxima_m3: sourceTank.capacidad_maxima_m3 ?? sourceTank.capacidad_maxima ?? sourceTank.capacidad_m3 ?? config?.capacidad_maxima_m3 ?? null,
        volumen_restante_m3: sourceTank.volumen_restante_m3 ?? sourceTank.rebose ?? config?.volumen_restante_m3 ?? null,
        nombre: config?.nombre ?? sourceTank.nombre ?? sourceTank.display_name ?? sourceTank.tag ?? null,
        display_name: config?.display_name ?? sourceTank.display_name ?? sourceTank.nombre ?? sourceTank.tag ?? null,
        // Si hay altura calibrada del catálogo, usar el porcentaje recalculado en todos los campos
        // para que calculateDisplayPorcentaje() no lea el valor crudo de la API.
        porcentaje_api: catalogHasCalibratedHeight ? computedPorcentaje : (Number.isFinite(Number(sourceTank.porcentaje)) ? Number(sourceTank.porcentaje) : null),
        porcentaje_capacidad: catalogHasCalibratedHeight ? computedPorcentaje : (Number.isFinite(Number(sourceTank.porcentaje_capacidad)) ? Number(sourceTank.porcentaje_capacidad) : null),
        porcentaje_capacidad_api: Number.isFinite(Number(sourceTank.porcentaje_capacidad)) ? Number(sourceTank.porcentaje_capacidad) : null,
        porcentaje: computedPorcentaje,
        nivel: nivelActual,
        valor_m: sourceTank.valor_m,
    };
};

const mergeApiTanquesWithCatalog = (apiTanques, catalog) => {
    if (!Array.isArray(apiTanques)) {
        return [];
    }
    const usedCatalog = catalog || getDefaultCatalog();
    return apiTanques.map((tank) => mergeTankWithCatalog(sanitizeTankForDisplay(tank), usedCatalog));
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
            // When renaming, keep old aliases so the entry can still be found by old name
            const oldDisplayAlias = normalizeText(item.display_name || item.nombre || "");
            const oldIdAlias = normalizeText(item.id || "");
            const aliases = Array.from(new Set([displayAlias, idAlias, oldDisplayAlias, oldIdAlias, ...baseAliases].filter(Boolean)));
            // Update the id to match the new display name for future lookups
            const newId = displayAlias || idAlias || merged.id;
            return { ...merged, id: newId, aliases };
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

const DELETED_KEY = "ibal-tanques:deletedTanks";

const loadDeletedTanks = () => {
    try {
        const raw = localStorage.getItem(DELETED_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const saveDeletedTanks = (list) => {
    try {
        localStorage.setItem(DELETED_KEY, JSON.stringify(list));
    } catch (err) {
        console.warn("No se pudo guardar la lista de tanques eliminados", err);
    }
};

const addDeletedTank = (tank) => {
    const deleted = loadDeletedTanks();
    const tag = normalizeText(tank.tag || tank.nombre || tank.display_name || "");
    const nombre = normalizeText(tank.nombre || tank.display_name || "");
    const displayName = normalizeText(tank.display_name || tank.nombre || "");
    const newEntries = [tag, nombre, displayName].filter(Boolean);
    const updated = [...new Set([...deleted, ...newEntries])];
    saveDeletedTanks(updated);
};

const isTankDeleted = (tank, deletedList = null) => {
    const deleted = deletedList || loadDeletedTanks();
    if (!deleted.length) return false;
    const tag = normalizeText(tank.tag || "");
    const nombre = normalizeText(tank.nombre || "");
    const displayName = normalizeText(tank.display_name || "");
    return [tag, nombre, displayName].some((key) => key && deleted.includes(key));
};

export {
    getDefaultCatalog,
    loadCatalog,
    saveCatalog,
    mergeApiTanquesWithCatalog,
    updateCatalogEntry,
    normalizeText,
    findCatalogEntry,
    calculateAutomaticPorcentaje,
    calculateDisplayPorcentaje,
    calculateDisplayPorcentajeFromValues,
    loadDeletedTanks,
    saveDeletedTanks,
    addDeletedTank,
    isTankDeleted,
};
