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
                $payload = $request->all();
                // Basic validation: require nodes and edges structure
                if (!is_array($payload) || !isset($payload['nodes']) || !is_array($payload['nodes'])) {
                    return response()->json(['ok' => false, 'error' => 'Invalid payload: missing nodes object'], 400);
                }
                $incomingNodeCount = count($payload['nodes']);
                // If existing authoritative file exists, perform safety checks
                $path = storage_path('app/district_state.json');
                if (file_exists($path)) {
                    try {
                        $existing = json_decode(file_get_contents($path), true) ?: [];
                        $existingNodes = isset($existing['nodes']) && is_array($existing['nodes']) ? count($existing['nodes']) : 0;
                        // Protect against accidental partial overwrite: if existing is large (e.g., 59)
                        // and incoming payload has fewer nodes without explicit deletion list, reject.
                        if ($existingNodes >= 59 && $incomingNodeCount < $existingNodes) {
                            $deleted = isset($payload['deletedNodeIds']) && is_array($payload['deletedNodeIds']) ? count($payload['deletedNodeIds']) : 0;
                            if ($deleted === 0 || ($existingNodes - $incomingNodeCount) !== $deleted) {
                                return response()->json(['ok' => false, 'error' => 'Rejected: incoming state appears incomplete (node count reduced)'], 400);
                            }
                        }
                        // Ensure incoming nodes include x/y positions if existing had them
                        foreach ($payload['nodes'] as $id => $node) {
                            if (!is_array($node)) continue;
                            if ((!array_key_exists('x', $node) || !array_key_exists('y', $node)) && isset($existing['nodes'][$id]) && (array_key_exists('x', $existing['nodes'][$id]) || array_key_exists('y', $existing['nodes'][$id]))) {
                                return response()->json(['ok' => false, 'error' => 'Rejected: incoming node positions missing for existing node ' . $id], 400);
                            }
                        }
                    } catch (\Throwable $e) {
                        // If reading existing fails, proceed with caution but validate minimal structure above
                    }
                }
            // attach timestamp
            $payload['updated_at'] = \Carbon\Carbon::now()->toIso8601String();

            // Prepare JSON
            $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

            // Backup existing file before overwrite
            try {
                if (file_exists($path)) {
                    $bakDir = dirname($path);
                    $bakName = $bakDir . DIRECTORY_SEPARATOR . 'district_state.bak.' . date('YmdHis') . '.json';
                    @copy($path, $bakName);
                }
            } catch (\Throwable $e) {
                // non-fatal: continue to write
            }

            // Write only after validation
            file_put_contents($path, $json);

            // Also write a copy to Windows temp for audit if possible
            try {
                $tmpPath = 'C:\\Windows\\Temp\\diagram_state_applied.json';
                @file_put_contents($tmpPath, $json);
            } catch (\Throwable $e) {
                // ignore write errors to temp
            }

            return response()->json(['ok' => true]);
        } catch (\Exception $e) {
            return response()->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
