<?php
require __DIR__ . '/vendor/autoload.php';

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;

$app = require __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

function normalizeName(string $value): string
{
    $value = trim(mb_strtolower($value, 'UTF-8'));
    $map = ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n', 'ü' => 'u'];
    $value = strtr($value, $map);
    return preg_replace('/[^a-z0-9 ]+/', '', $value);
}

function formatPercent($value): string
{
    if ($value === null) {
        return 'N/A';
    }
    return number_format((float) $value, 2, '.', '');
}

$expected = [
    'Aurora' => 78,
    'Belén' => 48,
    'Interlaken' => 17,
    'Ambalá 1' => 39,
    'Ambalá 2' => 33,
    'Alsacia' => 24,
    'Calucaima' => 82,
    'Ciudad' => null,
    'Tanque la 15' => 30,
    'Tanque la 29' => 42,
    'Tanque la 30' => 27,
    'Piedra Pintada 1' => 14,
    'Piedra Pintada 2' => 14,
    'Miramar' => 64,
    'Zona Industrial' => 5,
    'Cerro Gordo 1' => 42,
    'Cerro Gordo 2' => 28,
    'Mirolindo' => 61,
    'Picaleña 1' => 36,
    'Picaleña 2' => 53,
];

$config = config('tanques', []);

function findConfigMatch(string $rawName, array $config): array
{
    $normalizedName = normalizeName($rawName);
    $matches = [];

    foreach ($config as $item) {
        $aliases = $item['aliases'] ?? [];
        if (isset($item['display_name'])) {
            $aliases[] = $item['display_name'];
        }

        foreach ($aliases as $alias) {
            if ($alias === null) {
                continue;
            }

            $aliasNormalized = normalizeName($alias);
            if ($normalizedName === $aliasNormalized || str_contains($normalizedName, $aliasNormalized) || str_contains($aliasNormalized, $normalizedName)) {
                $matches[] = [
                    'item' => $item,
                    'matched_alias' => $aliasNormalized,
                ];
                break;
            }
        }
    }

    return $matches;
}

$ibalUrl = rtrim(env('IBAL_API_URL', ''), '/');
$apiKey = env('IBAL_API_KEY');
$apiResponse = ['status' => 'error', 'mensaje' => 'No se pudo obtener IBAL', 'tanques' => []];

try {
    if ($ibalUrl !== '') {
        $response = Http::withHeaders([
            'X-API-Key' => $apiKey,
        ])->timeout(10)->get($ibalUrl . '/tanques');

        if ($response->successful()) {
            $apiResponse = $response->json();
        } else {
            $apiResponse = [
                'status' => 'error',
                'mensaje' => 'HTTP ' . $response->status(),
                'tanques' => [],
            ];
        }
    }
} catch (Throwable $e) {
    $apiResponse = [
        'status' => 'error',
        'mensaje' => $e->getMessage(),
        'tanques' => [],
    ];
}

$apiTanques = $apiResponse['tanques'] ?? [];
$normalizedApi = [];
foreach ($apiTanques as $tank) {
    $name = $tank['nombre'] ?? ($tank['tag'] ?? '');
    $normalizedApi[normalizeName($name)] = $tank;
}

foreach ($expected as $expectedName => $expectedValue) {
    $normalizedExpected = normalizeName($expectedName);
    $foundTank = null;
    $matchedAlias = null;

    if (isset($normalizedApi[$normalizedExpected])) {
        $foundTank = $normalizedApi[$normalizedExpected];
    }

    if ($foundTank === null) {
        foreach ($apiTanques as $tank) {
            $name = $tank['nombre'] ?? ($tank['tag'] ?? '');
            if (normalizeName($name) === $normalizedExpected) {
                $foundTank = $tank;
                break;
            }
        }
    }

    if ($foundTank === null) {
        foreach ($apiTanques as $tank) {
            $name = $tank['nombre'] ?? ($tank['tag'] ?? '');
            $matches = findConfigMatch($name, $config);
            foreach ($matches as $match) {
                if (normalizeName($match['item']['display_name'] ?? '') === $normalizedExpected || in_array($normalizedExpected, array_map('normalizeName', $match['item']['aliases'] ?? []), true)) {
                    $foundTank = $tank;
                    $matchedAlias = $match['matched_alias'];
                    break 2;
                }
            }
        }
    }

    $apiName = $foundTank['nombre'] ?? ($foundTank['tag'] ?? null);
    $valor_m = isset($foundTank['valor_m']) && is_numeric($foundTank['valor_m']) ? (float) $foundTank['valor_m'] : null;
    $configMatches = $foundTank ? findConfigMatch($apiName, $config) : [];
    $matchedAlias = $matchedAlias ?? ($configMatches[0]['matched_alias'] ?? null);
    $altura_rebose = $configMatches[0]['item']['altura_rebose'] ?? null;
    $porcentaje_calculado = null;

    if (is_numeric($valor_m) && is_numeric($altura_rebose) && $altura_rebose > 0) {
        $porcentaje_calculado = ($valor_m / $altura_rebose) * 100;
    }

    $diff = null;
    if ($expectedValue !== null && is_numeric($porcentaje_calculado)) {
        $diff = abs($porcentaje_calculado - $expectedValue);
    }

    $status = 'N/A';
    if ($expectedValue !== null) {
        if ($diff !== null && $diff > 3) {
            $status = '❌ CONFIGURACIÓN INCORRECTA';
        } elseif ($diff !== null) {
            $status = '✅ CONFIGURACIÓN CORRECTA';
        } else {
            $status = 'NO SE PUDO CALCULAR';
        }
    }

    $cause = 'configuración inexistente';
    if (!$foundTank) {
        $cause = 'configuración inexistente';
    } elseif (!is_numeric($valor_m)) {
        $cause = 'valor_m';
    } elseif (!is_numeric($altura_rebose) || $altura_rebose <= 0) {
        $cause = 'altura_rebose';
    } elseif (count($configMatches) > 1) {
        $cause = 'alias';
    } else {
        $cause = 'altura_rebose';
    }

    echo str_repeat('-', 60) . "\n";
    echo "Nombre esperado (empresa): $expectedName\n";
    echo "Nombre recibido desde la API: " . ($apiName ?? 'NO ENCONTRADO') . "\n";
    echo "Alias encontrado: " . ($matchedAlias ?? 'N/A') . "\n";
    echo "valor_m recibido: " . (is_numeric($valor_m) ? formatPercent($valor_m) : 'N/A') . "\n";
    echo "altura_rebose utilizada: " . (is_numeric($altura_rebose) ? formatPercent($altura_rebose) : 'N/A') . "\n";
    echo "Porcentaje calculado: " . (is_numeric($porcentaje_calculado) ? formatPercent($porcentaje_calculado) . '%' : 'N/A') . "\n";
    echo "Porcentaje esperado (empresa): " . ($expectedValue === null ? 'N/A' : formatPercent($expectedValue) . '%') . "\n";
    echo "Diferencia absoluta: " . (is_numeric($diff) ? formatPercent($diff) . '%' : 'N/A') . "\n";
    echo "Resultado: $status\n";
    echo "Causa probable: $cause\n";
}
