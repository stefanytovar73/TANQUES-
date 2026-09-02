<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DiagramController extends Controller
{
    public function getState(Request $request)
    {
        try {
            $path = storage_path('app/district_state.json');
            if (!file_exists($path)) {
                return response()->json((object)[]);
            }
            $content = file_get_contents($path);
            $data = json_decode($content, true);
            if ($data === null) return response()->json((object)[]);
            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json((object)[], 500);
        }
    }

    public function saveState(Request $request)
    {
        try {
            $payload = $request->all();
            // attach server-side timestamp to help clients detect newer versions
            try {
                $payload['updated_at'] = \Carbon\Carbon::now()->toIso8601String();
            } catch (\Throwable $e) {
                $payload['updated_at'] = date('c');
            }
            $path = storage_path('app/district_state.json');
            $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            file_put_contents($path, $json);
            return response()->json(['ok' => true]);
        } catch (\Exception $e) {
            return response()->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
