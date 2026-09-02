<?php

namespace App\Http\Controllers;

use App\Helpers\TanqueHelper;
use App\Models\LocalTanque;
use App\Services\IbalApiService;
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
        try {
            $api = $this->ibal->obtenerTanques();
        } catch (\Throwable $e) {
            Log::error('Error llamando a IBAL: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'mensaje' => 'Error de conexión con IBAL',
                'tanques' => [],
            ]);
        }

        if (!isset($api['tanques']) || !is_array($api['tanques']) || count($api['tanques']) === 0) {
            $status = $api['status'] ?? 'invalid';
            $mensaje = $api['mensaje'] ?? 'IBAL no devolvió datos actuales válidos';
            return response()->json([
                'status' => $status === 'error' ? 'error' : 'invalid',
                'mensaje' => $mensaje,
                'tanques' => [],
            ]);
        }

        return response()->json([
            'status' => $api['status'] ?? 'ok',
            'mensaje' => $api['mensaje'] ?? null,
            'tanques' => array_values($api['tanques']),
        ]);
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

    /**
     * Obtener datos de captación (caudales) desde IBAL
     */
    public function captacion()
    {
        try {
            $api = $this->ibal->obtenerCaptacion();
        } catch (\Throwable $e) {
            Log::error('Error llamando a IBAL (captacion): ' . $e->getMessage());
            $api = ['status' => 'error', 'mensaje' => 'Error de conexión con IBAL', 'captacion' => []];
        }

        // Asegurar estructura esperada
        if (!isset($api['captacion']) || !is_array($api['captacion'])) {
            // Si el servicio devolvió directamente una lista, normalizar
            if (is_array($api)) {
                return response()->json($api);
            }
            return response()->json(['status' => isset($api['status']) ? $api['status'] : 'error', 'captacion' => []]);
        }

        return response()->json($api);
    }

    /**
     * Obtener datos PTAP (caudales planta) desde IBAL
     */
    public function ptap()
    {
        try {
            $api = $this->ibal->obtenerPtap();
        } catch (\Throwable $e) {
            Log::error('Error llamando a IBAL (ptap): ' . $e->getMessage());
            $api = ['status' => 'error', 'mensaje' => 'Error de conexión con IBAL', 'ptap' => []];
        }

        if (!isset($api['ptap']) || !is_array($api['ptap'])) {
            if (is_array($api)) {
                return response()->json($api);
            }
            return response()->json(['status' => isset($api['status']) ? $api['status'] : 'error', 'ptap' => []]);
        }

        return response()->json($api);
    }
}