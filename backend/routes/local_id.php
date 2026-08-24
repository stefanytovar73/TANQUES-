<?php

use Illuminate\Support\Facades\Http;

Route::get('/test-api', function () {

    $response = Http::withHeaders([
    'X-API-Key' => env('IBAL_API_KEY'),
])->get(env('IBAL_API_URL'));

    return [
        'status' => $response->status(),
        'body' => $response->json(),
    ];
});
