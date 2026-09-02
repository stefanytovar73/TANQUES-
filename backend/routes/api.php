<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TanquesController;
use App\Http\Controllers\DiagramController;

Route::get('/tanques', [TanquesController::class, 'index']);
Route::post('/tanques', [TanquesController::class, 'store']);
Route::put('/tanques/{id}', [TanquesController::class, 'update']);
Route::delete('/tanques/{id}', [TanquesController::class, 'destroy']);
Route::get('/caudales/captacion', [TanquesController::class, 'captacion']);
Route::get('/caudales/ptap', [TanquesController::class, 'ptap']);

// Diagram state persistence (shared between clients)
Route::get('/diagram/state', [DiagramController::class, 'getState']);
Route::post('/diagram/state', [DiagramController::class, 'saveState']);