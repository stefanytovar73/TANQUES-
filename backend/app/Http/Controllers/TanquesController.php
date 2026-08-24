<?php

namespace App\Http\Controllers;

use App\Helpers\TanqueHelper;
use App\Services\IbalApiService;
use App\Models\LocalTanque;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class TanquesController extends Controller
{
    protected $ibal;

    public function __construct(IbalApiService $ibal)
    {
        $this->ibal = $ibal;
    }

    public function index()
    {
        // Llamada a IBAL con protección: si falla, devolvemos únicamente las anulaciones locales
        try {
            $api = $this->ibal->obtenerTanques();
        } catch (\Throwable $e) {
            Log::error('Error llamando a IBAL: ' . $e->getMessage());
            $api = ['status' => 'error', 'mensaje' => 'Error de conexión con IBAL', 'tanques' => []];
        }

        $overrides = LocalTanque::all();

        // Asegurar que siempre tengamos la clave 'tanques' como array
        if (!isset($api['tanques']) || !is_array($api['tanques'])) {
            $api['tanques'] = [];
        }

        if (empty($api['tanques'])) {
            $localList = $overrides->values()->map(function ($o) {
                $tankName = $o->nombre;
                $area = TanqueHelper::getArea($tankName);
                $alturaMaxima = TanqueHelper::getAlturaMaxima($tankName);
                if ($area === null || $alturaMaxima === null) {
                    Log::warning('Tanque sin configuración en config/tanques.php', ['nombre' => $tankName, 'area_m2' => $area, 'altura_maxima' => $alturaMaxima]);
                }
                $alturaRebose = TanqueHelper::getAlturaRebose($tankName);
                $cotaRebose = TanqueHelper::getCotaRebose($tankName);
                $volumenFijo = TanqueHelper::getVolumen($tankName);
                $alarmaLlenado = TanqueHelper::getAlarmaLlenado($tankName);
                $alarmaVacio = TanqueHelper::getAlarmaVacio($tankName);
                $valorActual = $o->valor_m !== null && is_numeric($o->valor_m) ? (float) $o->valor_m : null;

                // Calcular métricas derivadas usando el área fija desde config/tanques.php
                if (is_numeric($area) && is_numeric($alturaMaxima)) {
                    $capacidadMaxima = (float) $area * (float) $alturaMaxima;
                } else {
                    $capacidadMaxima = $o->capacidad_maxima_m3 ?? $o->capacidad_maxima ?? null;
                }

                if (is_numeric($area) && is_numeric($valorActual)) {
                    $capacidadActual = (float) $area * (float) $valorActual;
                } else {
                    $capacidadActual = $o->capacidad_actual_m3 ?? $o->capacidad_actual ?? null;
                }

                if (is_numeric($valorActual) && (!is_numeric($alturaRebose) || $alturaRebose <= 0)) {
                    $porcentaje = 0;
                } elseif (is_numeric($alturaRebose) && is_numeric($valorActual) && $alturaRebose > 0) {
                    $porcentaje = ($valorActual / $alturaRebose) * 100;
                } else {
                    $porcentaje = null;
                }

                Log::info('Tanque porcentaje calculado', [
                    'nombre' => $tankName,
                    'valor_m' => $valorActual,
                    'altura_rebose' => $alturaRebose,
                    'porcentaje' => $porcentaje,
                ]);

                if (is_numeric($alturaMaxima) && is_numeric($valorActual)) {
                    $alturaRestante = (float) $alturaMaxima - (float) $valorActual;
                } else {
                    $alturaRestante = $o->altura_restante_m ?? null;
                }

                if (is_numeric($capacidadMaxima) && is_numeric($capacidadActual)) {
                    $volumenRestante = $capacidadMaxima - $capacidadActual;
                } else {
                    $volumenRestante = $o->volumen_restante_m3 ?? $o->rebose ?? null;
                }

                return [
                    'id' => $o->id,
                    'id' => $o->id,
                    'nombre' => $o->nombre,
                    'display_name' => TanqueHelper::getDisplayName($o->nombre) ?? $o->nombre,
                    'valor_m' => $o->valor_m,
                    'fecha_hora' => $o->updated_at ?? null,
                    'altura_maxima' => $alturaMaxima,
                    'altura_rebose' => $alturaRebose,
                    'volumen_m3' => $volumenFijo,
                    'alarma_llenado' => $alarmaLlenado,
                    'alarma_vacio' => $alarmaVacio,
                    'cota_rebose' => $cotaRebose,
                    'area_m2' => $area,
                    'volumen_restante_m3' => $volumenRestante,
                    'capacidad_actual_m3' => $capacidadActual,
                    'capacidad_maxima_m3' => $capacidadMaxima,
                    'porcentaje' => $porcentaje,
                    'altura_restante_m' => $alturaRestante,
                ];
            })->toArray();

            return response()->json([
                'status' => isset($api['status']) ? $api['status'] : 'partial',
                'mensaje' => 'IBAL inaccesible, devolviendo datos locales',
                'tanques' => $localList,
            ]);
        }

        $api['tanques'] = array_map(function ($t) {
            $tankName = $t['nombre'] ?? ($t['tag'] ?? '');
            $area = TanqueHelper::getArea($tankName);
            $alturaMaxima = TanqueHelper::getAlturaMaxima($tankName);
            if ($area === null || $alturaMaxima === null) {
                Log::warning('Tanque sin configuración en config/tanques.php', ['nombre' => $tankName, 'area_m2' => $area, 'altura_maxima' => $alturaMaxima]);
            }
            $alturaRebose = TanqueHelper::getAlturaRebose($tankName);
            $cotaRebose = TanqueHelper::getCotaRebose($tankName);
            $volumenFijo = TanqueHelper::getVolumen($tankName);
            $alarmaLlenado = TanqueHelper::getAlarmaLlenado($tankName);
            $alarmaVacio = TanqueHelper::getAlarmaVacio($tankName);
            $valorActual = isset($t['valor_m']) && is_numeric($t['valor_m']) ? (float) $t['valor_m'] : null;

            // Registrar datos crudos recibidos desde IBAL (temporal, diagnóstico)
            Log::info('Tanque raw IBAL', [
                'nombre' => $tankName,
                'raw' => $t,
            ]);

            // Calcular métricas derivadas usando el área fija desde config/tanques.php
            if (is_numeric($area) && is_numeric($alturaMaxima)) {
                $capacidadMaxima = (float) $area * (float) $alturaMaxima;
            } else {
                $capacidadMaxima = $t['capacidad_maxima_m3'] ?? $t['capacidad_maxima'] ?? null;
            }

            if (is_numeric($area) && is_numeric($valorActual)) {
                $capacidadActual = (float) $area * (float) $valorActual;
            } else {
                $capacidadActual = $t['capacidad_actual_m3'] ?? $t['capacidad_actual'] ?? null;
            }

            // Calcular porcentaje siempre a partir de valor_m y altura_rebose.
            if (is_numeric($valorActual) && (!is_numeric($alturaRebose) || $alturaRebose <= 0)) {
                $porcentaje = 0;
            } elseif (is_numeric($alturaRebose) && is_numeric($valorActual) && $alturaRebose > 0) {
                $porcentaje = ($valorActual / $alturaRebose) * 100;
            } else {
                $porcentaje = null;
            }

            Log::info('Tanque porcentaje calculado', [
                'nombre' => $tankName,
                'valor_m' => $valorActual,
                'altura_rebose' => $alturaRebose,
                'porcentaje' => $porcentaje,
            ]);

            if (is_numeric($alturaMaxima) && is_numeric($valorActual)) {
                $alturaRestante = (float) $alturaMaxima - (float) $valorActual;
            } else {
                $alturaRestante = $t['altura_restante_m'] ?? null;
            }

            if (is_numeric($capacidadMaxima) && is_numeric($capacidadActual)) {
                $volumenRestante = $capacidadMaxima - $capacidadActual;
            } else {
                $volumenRestante = $t['volumen_restante_m3'] ?? $t['rebose'] ?? null;
            }

            $payload = [
                'nombre' => $t['nombre'] ?? null,
                'display_name' => TanqueHelper::getDisplayName($tankName) ?? ($t['nombre'] ?? $t['tag'] ?? null),
                'valor_m' => $t['valor_m'] ?? null,
                'fecha_hora' => $t['fecha_hora'] ?? null,
                'altura_maxima' => $alturaMaxima,
                'altura_rebose' => $alturaRebose,
                'volumen_m3' => $volumenFijo,
                'alarma_llenado' => $alarmaLlenado,
                'alarma_vacio' => $alarmaVacio,
                'cota_rebose' => $cotaRebose,
                'area_m2' => $area,
                'volumen_restante_m3' => $volumenRestante,
                'capacidad_actual_m3' => $capacidadActual,
                'capacidad_maxima_m3' => $capacidadMaxima,
                'porcentaje' => $porcentaje,
                'altura_restante_m' => $alturaRestante,
            ];

            if (isset($t['tag'])) {
                $payload['tag'] = $t['tag'];
            }

            return $payload;
        }, $api['tanques']);

        // Merge any local overrides so manually created/edited tanks are present
        // and override API values when appropriate.
        $apiTanques = $api['tanques'];
        foreach ($overrides as $o) {
            $tankName = $o->nombre;
            $normalizedLocal = $this->normalizeName($tankName);

            $area = TanqueHelper::getArea($tankName);
            $alturaMaxima = TanqueHelper::getAlturaMaxima($tankName);
            $alturaRebose = TanqueHelper::getAlturaRebose($tankName);
            $cotaRebose = TanqueHelper::getCotaRebose($tankName);
            $volumenFijo = TanqueHelper::getVolumen($tankName);
            $alarmaLlenado = TanqueHelper::getAlarmaLlenado($tankName);
            $alarmaVacio = TanqueHelper::getAlarmaVacio($tankName);
            $valorActual = $o->valor_m !== null && is_numeric($o->valor_m) ? (float) $o->valor_m : null;

            if (is_numeric($area) && is_numeric($alturaMaxima)) {
                $capacidadMaxima = (float) $area * (float) $alturaMaxima;
            } else {
                $capacidadMaxima = $o->capacidad_maxima_m3 ?? $o->capacidad_maxima ?? null;
            }

            if (is_numeric($area) && is_numeric($valorActual)) {
                $capacidadActual = (float) $area * (float) $valorActual;
            } else {
                $capacidadActual = $o->capacidad_actual_m3 ?? $o->capacidad_actual ?? null;
            }

            // Calcular porcentaje a partir de valor_m y altura_rebose en datos locales.
            if (is_numeric($valorActual) && (!is_numeric($alturaRebose) || $alturaRebose <= 0)) {
                $porcentaje = 0;
            } elseif (is_numeric($alturaRebose) && is_numeric($valorActual) && $alturaRebose > 0) {
                $porcentaje = ($valorActual / $alturaRebose) * 100;
            } else {
                $porcentaje = null;
            }

            if (is_numeric($alturaMaxima) && is_numeric($valorActual)) {
                $alturaRestante = (float) $alturaMaxima - (float) $valorActual;
            } else {
                $alturaRestante = $o->altura_restante_m ?? null;
            }

            if (is_numeric($capacidadMaxima) && is_numeric($capacidadActual)) {
                $volumenRestante = $capacidadMaxima - $capacidadActual;
            } else {
                $volumenRestante = $o->volumen_restante_m3 ?? $o->rebose ?? null;
            }

            $localPayload = [
                'nombre' => $o->nombre,
                'display_name' => TanqueHelper::getDisplayName($o->nombre) ?? $o->nombre,
                'valor_m' => $o->valor_m,
                'fecha_hora' => $o->updated_at ?? null,
                'altura_maxima' => $alturaMaxima,
                'altura_rebose' => $alturaRebose,
                'volumen_m3' => $volumenFijo,
                'alarma_llenado' => $alarmaLlenado,
                'alarma_vacio' => $alarmaVacio,
                'cota_rebose' => $cotaRebose,
                'area_m2' => $area,
                'volumen_restante_m3' => $volumenRestante,
                'capacidad_actual_m3' => $capacidadActual,
                'capacidad_maxima_m3' => $capacidadMaxima,
                'porcentaje' => $porcentaje,
                'altura_restante_m' => $alturaRestante,
                'id' => $o->id,
            ];

            $found = false;
            foreach ($apiTanques as $idx => $apiT) {
                $apiName = $apiT['nombre'] ?? ($apiT['tag'] ?? '');
                if (TanqueHelper::sameTank($apiName, $tankName)) {
                    // No permitir que valores medidos en tiempo real (provenientes de la API)
                    // sean sobrescritos por configuraciones locales.
                    $localFiltered = array_filter($localPayload, function ($v) { return $v !== null; });

                    $protected = ['valor_m', 'porcentaje', 'fecha_hora', 'altura_restante_m', 'capacidad_actual_m3'];
                    foreach ($protected as $field) {
                        if (isset($apiT[$field]) && $apiT[$field] !== null && isset($localFiltered[$field])) {
                            unset($localFiltered[$field]);
                        }
                    }

                    $apiTanques[$idx] = array_merge($apiT, $localFiltered);
                    $found = true;
                    break;
                }
            }

            if (! $found) {
                $apiTanques[] = $localPayload;
            }
        }

        $api['tanques'] = $apiTanques;

        return response()->json($api);
    }

    protected function normalizeName($nombre)
    {
        $value = mb_strtolower(trim((string) $nombre), 'UTF-8');
        $map = [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
            'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u',
            'ñ' => 'n', 'Ñ' => 'n', 'ü' => 'u', 'Ü' => 'u',
        ];
        $value = strtr($value, $map);
        return preg_replace('/[^a-z0-9 ]+/', '', $value);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string',
            'valor_m' => 'nullable|numeric',
            'nivel_maximo' => 'nullable|numeric',
            'porcentaje' => 'nullable|numeric',
        ]);

        $existing = LocalTanque::all()->first(function ($item) use ($data) {
            return TanqueHelper::sameTank($item->nombre ?? '', $data['nombre'] ?? '');
        });

        if ($existing) {
            $existing->update($data);
            $tanque = $existing;
        } else {
            $tanque = LocalTanque::create($data);
        }

        return response()->json($tanque, 201);
    }

    public function update(Request $request, $id)
    {
        $data = $request->validate([
            'nombre' => 'required|string',
            'valor_m' => 'nullable|numeric',
            'nivel_maximo' => 'nullable|numeric',
            'porcentaje' => 'nullable|numeric',
        ]);

        $tanque = LocalTanque::findOrFail($id);
        $tanque->update($data);

        return response()->json($tanque);
    }

    public function destroy($id)
    {
        $tanque = LocalTanque::findOrFail($id);
        $tanque->delete();
        return response()->json(['deleted' => true]);
    }
}