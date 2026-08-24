// Posiciones y conexiones visuales (configuración solo visual)
const NODES = [
  { id: 'ptap-pola-1', type: 'plant', label: 'PTAP LA POLA N.º 1', position: { x: 120, y: 80 } },
  { id: 'ptap-pola-2', type: 'plant', label: 'PTAP LA POLA N.º 2', position: { x: 120, y: 220 } },
  { id: 'ptap-chembe', type: 'plant', label: 'PTAP CHEMBE', position: { x: 120, y: 360 } },

  { id: 'tanque-belen', type: 'tank', label: 'Belén', position: { x: 360, y: 80 } },
  { id: 'tanque-belen-aurora', type: 'tank', label: 'La Aurora', position: { x: 560, y: 80 } },
  { id: 'tanque-ciudad', type: 'tank', label: 'Ciudad', position: { x: 360, y: 220 } },
  { id: 'tanque-alsacia', type: 'tank', label: 'Alsacia', position: { x: 560, y: 220 } },
  { id: 'tanque-elevado', type: 'tank', label: 'Elevado', position: { x: 360, y: 360 } },
  { id: 'tanque-semienterrado', type: 'tank', label: 'Semienterrado', position: { x: 560, y: 360 } },

  // Additional catalog tanks (visual-only positions)
  { id: 'tanque-tanque-1', type: 'tank', label: 'Tanque 1', position: { x: 760, y: 40 } },
  { id: 'tanque-tanque-2', type: 'tank', label: 'Tanque 2', position: { x: 960, y: 40 } },
  { id: 'tanque-picalena-1', type: 'tank', label: 'Picaleña 1', position: { x: 760, y: 160 } },
  { id: 'tanque-picalena-2', type: 'tank', label: 'Picaleña 2', position: { x: 960, y: 160 } },
  { id: 'tanque-la-15', type: 'tank', label: 'Tanque La 15', position: { x: 760, y: 280 } },
  { id: 'tanque-interlaken', type: 'tank', label: 'Interlaken', position: { x: 960, y: 280 } },
  { id: 'tanque-mirolindo', type: 'tank', label: 'Mirolindo', position: { x: 760, y: 400 } },
  { id: 'tanque-ambala-1', type: 'tank', label: 'Ambala 1', position: { x: 960, y: 400 } },
  { id: 'tanque-ambala-2', type: 'tank', label: 'Ambala 2', position: { x: 760, y: 520 } },
  { id: 'tanque-calucaima', type: 'tank', label: 'Calucaima', position: { x: 960, y: 520 } },
  { id: 'tanque-miramar', type: 'tank', label: 'Miramar', position: { x: 1160, y: 40 } },
  { id: 'tanque-villamarin', type: 'tank', label: 'Villamarin', position: { x: 1160, y: 160 } },
  { id: 'tanque-2000', type: 'tank', label: '2000', position: { x: 1160, y: 280 } },
  { id: 'tanque-la-30', type: 'tank', label: 'Tanque La 30', position: { x: 1160, y: 400 } },
  { id: 'tanque-la-29', type: 'tank', label: 'Tanque La 29', position: { x: 1160, y: 520 } },
  { id: 'tanque-cerro-gordo-1', type: 'tank', label: 'Cerro Gordo 1', position: { x: 1360, y: 40 } },
  { id: 'tanque-piedra-pintada-1', type: 'tank', label: 'Piedra Pintada 1', position: { x: 1360, y: 160 } },
  { id: 'tanque-cerro-gordo-2', type: 'tank', label: 'Cerro Gordo 2', position: { x: 1360, y: 280 } },
  { id: 'tanque-piedra-pintada-2', type: 'tank', label: 'Piedra Pintada 2', position: { x: 1360, y: 400 } },
  { id: 'tanque-cerro-gordo-3', type: 'tank', label: 'Cerro Gordo 3', position: { x: 1360, y: 520 } },
  { id: 'tanque-zona-industrial', type: 'tank', label: 'Zona Industrial', position: { x: 1560, y: 160 } },
  { id: 'tanque-sur', type: 'tank', label: 'Sur', position: { x: 1560, y: 400 } },

  // Distritos (inferior)
  { id: 'distr-belen', type: 'district', label: 'BELÉN', position: { x: 240, y: 520 } },
  { id: 'distr-ciudad', type: 'district', label: 'CIUDAD', position: { x: 360, y: 520 } },
  { id: 'distr-aurora', type: 'district', label: 'AURORA', position: { x: 480, y: 520 } },
  { id: 'distr-alsacia', type: 'district', label: 'ALSACIA', position: { x: 600, y: 520 } },
  { id: 'distr-miramap', type: 'district', label: 'MIRAMAR', position: { x: 720, y: 520 } },
];

const CONNECTIONS = [
  { from: 'ptap-pola-1', to: 'tanque-belen', label: 'SALIDA' },
  { from: 'ptap-pola-2', to: 'tanque-ciudad', label: 'SALIDA' },
  { from: 'ptap-chembe', to: 'tanque-alsacia', label: 'SALIDA' },
  { from: 'tanque-belen', to: 'tanque-ciudad', label: 'SALIDA' },
  { from: 'tanque-ciudad', to: 'distr-ciudad', label: 'DISTRITO' },
  { from: 'tanque-alsacia', to: 'distr-alsacia', label: 'DISTRITO' },
  { from: 'tanque-belen', to: 'distr-belen', label: 'DISTRITO' },
  { from: 'tanque-belen-aurora', to: 'distr-aurora', label: 'DISTRITO' },
];

export { NODES, CONNECTIONS };
