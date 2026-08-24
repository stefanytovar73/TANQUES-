<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LocalTanque extends Model
{
    use HasFactory;

    protected $table = 'local_tanques';

    protected $fillable = [
        'nombre',
        'valor_m',
        'nivel_maximo',
        'porcentaje',
    ];
}
