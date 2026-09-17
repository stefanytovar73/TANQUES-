import tanqueService from './tanqueService';

// Telemetry bootstrap: iniciar PTAP tan pronto como el módulo sea importado.
// No await, no bloqueo. Utiliza el cache/pending interno de `tanqueService`.
try {
  // Llamada no bloqueante — si ya existe pending/cache, `tanqueService` lo gestionará.
  tanqueService.getPtap().catch(() => {});
  // Iniciar /api/tanques también para que haya una única fuente central al inicio.
  try { tanqueService.getTanques().catch(() => {}); } catch (e) {}
} catch (e) {
  // silenciar errores de arranque
}

export default null;

// Performance longtask observer for profiling during boot/telemetry
try {
  if (typeof window !== 'undefined') {
    window.__LONGTASKS = window.__LONGTASKS || [];
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          try {
            window.__LONGTASKS.push({ start: Math.round(performance.timeOrigin + entry.startTime), duration: Math.round(entry.duration), attribution: entry.attribution || null });
          } catch (e) {}
        }
      });
      po.observe({ entryTypes: ['longtask'] });
      window.__LONGTASK_OBSERVER = po;
    } catch (e) {}
  }
} catch (e) {}
