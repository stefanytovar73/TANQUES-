<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('local_tanques', function (Blueprint $table) {
            $table->id();
            $table->string('nombre')->index();
            $table->decimal('valor_m', 8, 3)->nullable();
            $table->decimal('nivel_maximo', 8, 3)->nullable();
            $table->decimal('porcentaje', 5, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('local_tanques');
    }
};
