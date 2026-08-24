<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Http;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/test-api', function () {

    $response = Http::withHeaders([
        'X-API-Key' => env('IBAL_API_KEY'),
    ])->get(env('IBAL_API_URL'));

    return [
        'status' => $response->status(),
        'body' => $response->json(),
    ];
});

Route::get('/probar-endpoints', function () {

    $base = rtrim(env('IBAL_API_URL'), '/');

    $endpoints = [
        '',
        '/tanques',
        '/dashboard',
        '/estado',
        '/indicadores',
        '/niveles',
        '/resumen',
        '/monitor',
        '/tanques/resumen',
        '/tanques/dashboard',
    ];

    $resultado = [];

    foreach ($endpoints as $ep) {

        try {

            $r = Http::withHeaders([
                'X-API-Key' => env('IBAL_API_KEY'),
            ])->timeout(5)->get($base . $ep);

            $resultado[$ep === '' ? '/' : $ep] = [
                'status' => $r->status(),
                'body' => $r->json(),
            ];

        } catch (\Throwable $e) {

            $resultado[$ep === '' ? '/' : $ep] = $e->getMessage();

        }

    }

    return $resultado;
});