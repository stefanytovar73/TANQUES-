<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class IbalApiService
{
    public function obtenerDistritosBootstrap()
    {
        $tanquesCacheKey = __CLASS__ . '::obtenerTanques';
        $captacionCacheKey = __CLASS__ . '::obtenerCaptacion';
        $ptapCacheKey = __CLASS__ . '::obtenerPtap';

        $cachedTanques = Cache::get($tanquesCacheKey);
        $cachedCaptacion = Cache::get($captacionCacheKey);
        $cachedPtap = Cache::get($ptapCacheKey);

        // Si las tres fuentes siguen vigentes, devolverlas juntas inmediatamente.
        if ($cachedTanques && $cachedCaptacion && $cachedPtap) {
            return [
                'status' => 'ok',
                'tanques' => $cachedTanques,
                'captacion' => $cachedCaptacion,
                'ptap' => $cachedPtap,
            ];
        }

        $baseUrl = rtrim(env('IBAL_API_URL'), '/');
        $headers = ['X-API-Key' => env('IBAL_API_KEY')];

        try {
            // Una sola petición del frontend y tres solicitudes salientes concurrentes.
            // Esto evita que php artisan serve procese /tanques, /captacion y /ptap
            // de forma secuencial y permite pintar toda la telemetría a la vez.
            $responses = Http::pool(fn (Pool $pool) => [
                $pool->as('tanques')->withHeaders($headers)->retry(2, 100)->timeout(10)->get($baseUrl . '/tanques'),
                $pool->as('captacion')->withHeaders($headers)->retry(2, 100)->timeout(10)->get($baseUrl . '/captacion'),
                $pool->as('ptap')->withHeaders($headers)->retry(2, 100)->timeout(10)->get($baseUrl . '/ptap'),
            ]);

            $tanques = $cachedTanques;
            $captacion = $cachedCaptacion;
            $ptap = $cachedPtap;

            if (isset($responses['tanques']) && $responses['tanques']->successful()) {
                $candidate = $responses['tanques']->json();
                if (is_array($candidate) && isset($candidate['tanques']) && is_array($candidate['tanques']) && count($candidate['tanques']) > 0) {
                    $tanques = $candidate;
                    Cache::put($tanquesCacheKey, $candidate, now()->addSeconds(30));
                }
            }

            if (isset($responses['captacion']) && $responses['captacion']->successful()) {
                $candidate = $responses['captacion']->json();
                if (is_array($candidate)) {
                    $captacion = $candidate;
                    Cache::put($captacionCacheKey, $candidate, now()->addSeconds(30));
                }
            }

            if (isset($responses['ptap']) && $responses['ptap']->successful()) {
                $candidate = $responses['ptap']->json();
                if (is_array($candidate)) {
                    $ptap = $candidate;
                    Cache::put($ptapCacheKey, $candidate, now()->addSeconds(30));
                }
            }

            return [
                'status' => ($tanques && $captacion && $ptap) ? 'ok' : 'partial',
                'tanques' => $tanques,
                'captacion' => $captacion,
                'ptap' => $ptap,
            ];
        } catch (\Throwable $e) {
            Log::error('IbalApiService::obtenerDistritosBootstrap excepción', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);

            return [
                'status' => 'error',
                'mensaje' => 'No fue posible cargar toda la telemetría IBAL',
                'tanques' => $cachedTanques,
                'captacion' => $cachedCaptacion,
                'ptap' => $cachedPtap,
            ];
        }
    }

    public function obtenerTanques()
    {
        $cacheKey = __METHOD__;

        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        try {
            $response = Http::retry(2, 100)->withHeaders([
                'X-API-Key' => env('IBAL_API_KEY')
            ])->timeout(10)->get(rtrim(env('IBAL_API_URL'), '/') . '/tanques');

            if (!$response->successful()) {
                Log::error('IbalApiService: respuesta no exitosa', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return [
                    'status' => 'error',
                    'mensaje' => 'No fue posible consultar la API del IBAL',
                    'code' => $response->status(),
                    'tanques' => []
                ];
            }

            $json = $response->json();
            if (!is_array($json) || !isset($json['tanques']) || !is_array($json['tanques']) || count($json['tanques']) === 0) {
                Log::error('IbalApiService: respuesta inválida o sin datos actuales', [
                    'body' => $response->body(),
                ]);
                return [
                    'status' => 'invalid',
                    'mensaje' => 'IBAL no devolvió datos actuales válidos',
                    'tanques' => []
                ];
            }

            try {
                Cache::put($cacheKey, $json, now()->addSeconds(30));
            } catch (\Throwable $e) {
                Log::warning('IbalApiService: no se pudo cachear la respuesta', ['message' => $e->getMessage()]);
            }

            return $json;
        } catch (\Throwable $e) {
            Log::error('IbalApiService: excepción al llamar IBAL', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);

            return [
                'status' => 'error',
                'mensaje' => 'Error de conexión con IBAL: ' . $e->getMessage(),
                'tanques' => []
            ];
        }
    }

    public function obtenerCaptacion()
    {
        $cacheKey = __METHOD__;

        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        try {
            $response = Http::retry(2, 100)->withHeaders([
                'X-API-Key' => env('IBAL_API_KEY')
            ])->timeout(10)->get(rtrim(env('IBAL_API_URL'), '/') . '/captacion');

            if (!$response->successful()) {
                Log::error('IbalApiService::captacion respuesta no exitosa', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return [
                    'status' => 'error',
                    'mensaje' => 'No fue posible consultar la API del IBAL (captacion)',
                    'code' => $response->status(),
                    'captacion' => []
                ];
            }

            $json = $response->json();

            try {
                Cache::put($cacheKey, $json, now()->addSeconds(30));
            } catch (\Throwable $e) {
                Log::warning('IbalApiService::captacion no se pudo cachear', ['message' => $e->getMessage()]);
            }

            return $json;
        } catch (\Throwable $e) {
            Log::error('IbalApiService::captacion excepción', ['message' => $e->getMessage(), 'exception' => get_class($e)]);
            return [
                'status' => 'error',
                'mensaje' => 'Error de conexión con IBAL (captacion): ' . $e->getMessage(),
                'captacion' => []
            ];
        }
    }

    public function obtenerPtap()
    {
        $cacheKey = __METHOD__;

        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        try {
            $response = Http::retry(2, 100)->withHeaders([
                'X-API-Key' => env('IBAL_API_KEY')
            ])->timeout(10)->get(rtrim(env('IBAL_API_URL'), '/') . '/ptap');

            if (!$response->successful()) {
                Log::error('IbalApiService::ptap respuesta no exitosa', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return [
                    'status' => 'error',
                    'mensaje' => 'No fue posible consultar la API del IBAL (ptap)',
                    'code' => $response->status(),
                    'ptap' => []
                ];
            }

            $json = $response->json();

            try {
                Cache::put($cacheKey, $json, now()->addSeconds(30));
            } catch (\Throwable $e) {
                Log::warning('IbalApiService::ptap no se pudo cachear', ['message' => $e->getMessage()]);
            }

            return $json;
        } catch (\Throwable $e) {
            Log::error('IbalApiService::ptap excepción', ['message' => $e->getMessage(), 'exception' => get_class($e)]);
            return [
                'status' => 'error',
                'mensaje' => 'Error de conexión con IBAL (ptap): ' . $e->getMessage(),
                'ptap' => []
            ];
        }
    }
}