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

const getAuthoritativeApiPercentage = (tank) => {
    if (!tank || typeof tank !== "object") return { present: false, value: null };

    // La API IBAL actual publica porcentaje_capacidad. Si el campo viene presente,
    // incluso como null, esa es la respuesta autoritativa y no debemos inventar
    // otro porcentaje desde el catálogo local.
    if (Object.prototype.hasOwnProperty.call(tank, "porcentaje_capacidad")) {
        const value = parseNumber(tank.porcentaje_capacidad);
        return { present: true, value };
    }

    // Compatibilidad con payloads anteriores del backend.
    if (Object.prototype.hasOwnProperty.call(tank, "porcentaje_api")) {
        const value = parseNumber(tank.porcentaje_api);
        return { present: true, value };
    }
    if (Object.prototype.hasOwnProperty.call(tank, "porcentaje")) {
        const value = parseNumber(tank.porcentaje);
        return { present: true, value };
    }

    return { present: false, value: null };
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

    const apiPercentage = getAuthoritativeApiPercentage(tank);
    if (apiPercentage.present) {
        return apiPercentage.value;
    }

    // Solo para objetos que realmente no traen ningún campo de porcentaje
    // (por ejemplo datos locales antiguos), conservar el cálculo de respaldo.
    const nivel = (tank.valor_m !== null && tank.valor_m !== undefined && tank.valor_m !== "") && Number.isFinite(Number(tank.valor_m)) ? Number(tank.valor_m)
        : ((tank.nivel !== null && tank.nivel !== undefined && tank.nivel !== "") && Number.isFinite(Number(tank.nivel)) ? Number(tank.nivel) : null);
    if (nivel === null) return null;

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

    // Mantener intacto porcentaje_capacidad, incluido null, porque su mera
    // presencia significa que IBAL ya decidió si existe o no un porcentaje.
    const hadPorcentaje = Object.prototype.hasOwnProperty.call(sanitized, "porcentaje");
    const rawPorcentaje = hadPorcentaje ? parseNumber(sanitized.porcentaje) : null;

    // Evitar que un porcentaje calculado en una pasada anterior se convierta
    // accidentalmente en "dato API" al volver a mezclar el objeto.
    delete sanitized.porcentaje;
    delete sanitized.pct;

    if (!Object.prototype.hasOwnProperty.call(sanitized, "porcentaje_api") && hadPorcentaje) {
        sanitized.porcentaje_api = rawPorcentaje;
    }
    if (!Object.prototype.hasOwnProperty.call(sanitized, "porcentaje_capacidad_api")
        && Object.prototype.hasOwnProperty.call(sanitized, "porcentaje_capacidad")) {
        sanitized.porcentaje_capacidad_api = parseNumber(sanitized.porcentaje_capacidad);
    }

    return sanitized;
};

const mergeTankWithCatalog = (tank, catalog) => {
    const sourceTank = sanitizeTankForDisplay(tank);
    const config = findCatalogEntry(sourceTank, catalog);
    const nivelActual = Number.isFinite(Number(sourceTank.valor_m)) ? Number(sourceTank.valor_m) : null;

    // Prioridad de altura_rebose:
    //  1. config.altura_rebose_calibrada  ← coincide con el porcentaje que muestra IBAL
    //  2. config.altura_rebose            ← valor del catálogo sin calibrar
    //  3. API altura_rebose_m             ← raw del sensor (útil solo cuando no hay catálogo)
    //  4. API altura_rebose               ← último recurso
    const rawAltura = (config?.altura_rebose_calibrada != null && Number.isFinite(Number(config.altura_rebose_calibrada)))
        ? Number(config.altura_rebose_calibrada)
        : ((config?.altura_rebose != null && Number.isFinite(Number(config.altura_rebose)))
            ? Number(config.altura_rebose)
            : ((sourceTank.altura_rebose_m !== null && sourceTank.altura_rebose_m !== undefined && sourceTank.altura_rebose_m !== '') && Number.isFinite(Number(sourceTank.altura_rebose_m))
                ? Number(sourceTank.altura_rebose_m)
                : ((sourceTank.altura_rebose !== null && sourceTank.altura_rebose !== undefined && sourceTank.altura_rebose !== '') && Number.isFinite(Number(sourceTank.altura_rebose))
                    ? Number(sourceTank.altura_rebose) : null)));

    const apiPercentage = getAuthoritativeApiPercentage(sourceTank);
    const computedPorcentaje = apiPercentage.present
        ? apiPercentage.value
        : ((nivelActual != null && rawAltura != null && rawAltura > 0)
            ? calculateDisplayPorcentaje({ ...sourceTank, valor_m: nivelActual, altura_rebose: rawAltura })
            : null);

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
        // Preservar los campos raw de IBAL y exponer el mismo porcentaje a toda la UI.
        porcentaje_api: Number.isFinite(Number(sourceTank.porcentaje_api)) ? Number(sourceTank.porcentaje_api) : null,
        porcentaje_capacidad: Object.prototype.hasOwnProperty.call(sourceTank, "porcentaje_capacidad")
            ? parseNumber(sourceTank.porcentaje_capacidad)
            : null,
        porcentaje_capacidad_api: Object.prototype.hasOwnProperty.call(sourceTank, "porcentaje_capacidad")
            ? parseNumber(sourceTank.porcentaje_capacidad)
            : (Number.isFinite(Number(sourceTank.porcentaje_capacidad_api)) ? Number(sourceTank.porcentaje_capacidad_api) : null),
        porcentaje: computedPorcentaje,
        nivel: nivelActual,
        valor_m: sourceTank.valor_m,
    };
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
