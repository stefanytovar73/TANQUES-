<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TanquesController;

Route::get('/tanques', [TanquesController::class, 'index']);
Route::post('/tanques', [TanquesController::class, 'store']);
Route::put('/tanques/{id}', [TanquesController::class, 'update']);
Route::delete('/tanques/{id}', [TanquesController::class, 'destroy']);