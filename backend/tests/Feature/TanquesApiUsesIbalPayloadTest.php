<?php

namespace Tests\Feature;

use App\Models\LocalTanque;
use App\Services\IbalApiService;
use Illuminate\Foundation\Testing\WithoutMiddleware;
use Tests\TestCase;

class TanquesApiUsesIbalPayloadTest extends TestCase
{
    use WithoutMiddleware;

    public function test_api_tanques_preserves_ibal_values_without_local_overrides(): void
    {
        $this->app->instance(IbalApiService::class, new class extends IbalApiService {
            public function obtenerTanques(): array
            {
                return [
                    'status' => 'ok',
                    'total' => 1,
                    'tanques' => [[
                        'nombre' => 'Tanque La 29',
                        'display_name' => 'Tanque 29',
                        'tag' => 'NIVEL_LA_29',
                        'valor_m' => 1.73,
                        'altura_maxima' => 5,
                        'altura_rebose' => 3.01,
                        'porcentaje' => 57.475,
                        'capacidad_actual_m3' => 2553.48,
                        'capacidad_maxima_m3' => 7380,
                        'volumen_m3' => 6100,
                        'area_m2' => 1476,
                        'fecha_hora' => '2026-08-28 10:30:00',
                    ]],
                ];
            }
        });

        $response = $this->getJson('/api/tanques');

        $response->assertOk();
        $response->assertJsonPath('status', 'ok');
        $response->assertJsonPath('tanques.0.tag', 'NIVEL_LA_29');
        $response->assertJsonPath('tanques.0.valor_m', 1.73);
        $response->assertJsonPath('tanques.0.altura_rebose', 3.01);
        $response->assertJsonPath('tanques.0.porcentaje', 57.475);
        $this->assertNotSame(6.6551724138, $response->json('tanques.0.altura_rebose'));
    }

    public function test_api_tanques_calculates_percentage_from_same_ibal_payload(): void
    {
        $this->app->instance(IbalApiService::class, new class extends IbalApiService {
            public function obtenerTanques(): array
            {
                return [
                    'status' => 'ok',
                    'tanques' => [[
                        'nombre' => 'Tanque La 29',
                        'tag' => 'NIVEL_LA_29',
                        'valor_m' => 1.83,
                        'altura_rebose' => 6.6551724138,
                        'porcentaje' => 27.5,
                    ]],
                ];
            }
        });

        $response = $this->getJson('/api/tanques');

        $response->assertOk();
        $expected = (1.83 / 6.6551724138) * 100;
        $this->assertEqualsWithDelta($expected, (float) $response->json('tanques.0.porcentaje'), 0.5);
    }

    public function test_local_tank_update_route_persists_name_changes(): void
    {
        $this->artisan('migrate:fresh');

        $tanque = LocalTanque::create([
            'nombre' => 'Tanque prueba',
            'valor_m' => 1.2,
            'nivel_maximo' => 4.5,
            'porcentaje' => 30.0,
        ]);

        $response = $this->putJson('/api/tanques/' . $tanque->id, [
            'nombre' => 'Tanque prueba actualizado',
        ]);

        $response->assertOk();
        $response->assertJsonPath('nombre', 'Tanque prueba actualizado');
        $this->assertDatabaseHas('local_tanques', [
            'id' => $tanque->id,
            'nombre' => 'Tanque prueba actualizado',
        ]);
    }

    public function test_api_tanques_returns_error_when_ibal_fails(): void
    {
        $this->app->instance(IbalApiService::class, new class extends IbalApiService {
            public function obtenerTanques(): array
            {
                throw new \RuntimeException('timeout de conexión con IBAL');
            }
        });

        $response = $this->getJson('/api/tanques');

        $response->assertOk();
        $response->assertJsonPath('status', 'error');
        $response->assertJsonPath('tanques', []);
        $this->assertStringContainsString('IBAL', (string) $response->json('mensaje'));
    }

    public function test_api_tanques_returns_error_when_env_url_is_invalid(): void
    {
        $this->app->instance(IbalApiService::class, new class extends IbalApiService {
            public function obtenerTanques(): array
            {
                throw new \RuntimeException('IBAL_API_URL inválida o no responde');
            }
        });

        $response = $this->getJson('/api/tanques');

        $response->assertOk();
        $response->assertJsonPath('status', 'error');
        $response->assertJsonPath('tanques', []);
        $this->assertStringContainsString('IBAL', (string) $response->json('mensaje'));
    }
}
