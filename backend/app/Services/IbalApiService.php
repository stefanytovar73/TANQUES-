<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class IbalApiService
{
    public function obtenerTanques()
    {
        $cacheKey = __METHOD__;

        // Try to serve a recent successful response from cache first
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        try {
            // Retry a couple times and use a slightly larger timeout to accommodate network latency
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

            // Cache only successful responses for a short time window (30 seconds)
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