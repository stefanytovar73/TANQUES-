<?php

namespace App\Helpers;

use Illuminate\Support\Str;

class TanqueHelper
{
    public static function normalizeName(string $nombre): string
    {
        $value = mb_strtolower(trim($nombre), 'UTF-8');
        $map = [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
            'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u',
            'ñ' => 'n', 'Ñ' => 'n', 'ü' => 'u', 'Ü' => 'u',
        ];
        $value = strtr($value, $map);
        return preg_replace('/[^a-z0-9 ]+/', '', $value);
    }

    public static function configFor(string $nombre): ?array
    {
        $normalized = self::normalizeName($nombre);

        // First, prefer exact alias matches.
        foreach (config('tanques', []) as $item) {
            $aliases = array_map([self::class, 'normalizeName'], $item['aliases'] ?? []);
            $displayName = self::normalizeName($item['display_name'] ?? $item['nombre'] ?? '');
            if ($normalized === $displayName || in_array($normalized, $aliases, true)) {
                return $item;
            }
        }

        // Fallback to fuzzy substring matching only when no exact alias is found.
        foreach (config('tanques', []) as $item) {
            foreach (($item['aliases'] ?? []) as $alias) {
                $aliasNorm = self::normalizeName($alias);
                if (Str::contains($normalized, $aliasNorm) || Str::contains($aliasNorm, $normalized)) {
                    return $item;
                }
            }
        }

        return null;
    }

    public static function sameTank(string $nombreA, string $nombreB): bool
    {
        $normalizedA = self::normalizeName($nombreA);
        $normalizedB = self::normalizeName($nombreB);
        if ($normalizedA === $normalizedB) {
            return true;
        }

        $configA = self::configFor($nombreA);
        $configB = self::configFor($nombreB);
        if ($configA && $configB) {
            $aliasesA = array_unique(array_merge([
                self::normalizeName($configA['display_name'] ?? $configA['nombre'] ?? ''),
                $normalizedA,
            ], array_map([self::class, 'normalizeName'], $configA['aliases'] ?? [])));
            $aliasesB = array_unique(array_merge([
                self::normalizeName($configB['display_name'] ?? $configB['nombre'] ?? ''),
                $normalizedB,
            ], array_map([self::class, 'normalizeName'], $configB['aliases'] ?? [])));

            if (count(array_intersect($aliasesA, $aliasesB)) > 0) {
                return true;
            }
        }

        if ($configA) {
            $aliasesA = array_unique(array_merge([
                self::normalizeName($configA['display_name'] ?? $configA['nombre'] ?? ''),
                $normalizedA,
            ], array_map([self::class, 'normalizeName'], $configA['aliases'] ?? [])));
            if (in_array($normalizedB, $aliasesA, true)) {
                return true;
            }
        }

        if ($configB) {
            $aliasesB = array_unique(array_merge([
                self::normalizeName($configB['display_name'] ?? $configB['nombre'] ?? ''),
                $normalizedB,
            ], array_map([self::class, 'normalizeName'], $configB['aliases'] ?? [])));
            if (in_array($normalizedA, $aliasesB, true)) {
                return true;
            }
        }

        return false;
    }

    public static function getArea(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['area_m2'])) {
            return (float) $config['area_m2'];
        }

        return null;
    }

    public static function getAlturaMaxima(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['altura_maxima'])) {
            return (float) $config['altura_maxima'];
        }

        return null;
    }

    public static function getAlturaRebose(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['altura_rebose'])) {
            return (float) $config['altura_rebose'];
        }

        return null;
    }

    public static function getCotaRebose(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['cota_rebose'])) {
            return (float) $config['cota_rebose'];
        }

        return null;
    }

    public static function getDisplayName(string $nombre): ?string
    {
        $config = self::configFor($nombre);
        if (isset($config['display_name'])) {
            return (string) $config['display_name'];
        }

        return null;
    }

    public static function getVolumen(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['volumen_m3'])) {
            return is_numeric($config['volumen_m3']) ? (float) $config['volumen_m3'] : null;
        }

        return null;
    }

    public static function getAlarmaLlenado(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['alarma_llenado'])) {
            return is_numeric($config['alarma_llenado']) ? (float) $config['alarma_llenado'] : null;
        }

        return null;
    }

    public static function getAlarmaVacio(string $nombre): ?float
    {
        $config = self::configFor($nombre);
        if (isset($config['alarma_vacio'])) {
            return is_numeric($config['alarma_vacio']) ? (float) $config['alarma_vacio'] : null;
        }

        return null;
    }
    public static function calcularReboseDisponible(?float $capacidadActual, ?float $capacidadMaxima): ?float
    {
        if (!is_numeric($capacidadActual) || !is_numeric($capacidadMaxima)) {
            return null;
        }

        return max(0, $capacidadMaxima - $capacidadActual);
    }

    public static function calcularAlturaRestante(?float $alturaMaxima, ?float $nivelActual): ?float
    {
        if (!is_numeric($alturaMaxima) || !is_numeric($nivelActual)) {
            return null;
        }

        return max(0, $alturaMaxima - $nivelActual);
    }
}
