import { MigrationInterface, QueryRunner } from "typeorm";

export class InitParkingDbSchema1693600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar y crear tipos ENUM si no existen
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
          CREATE TYPE "role_enum" AS ENUM ('admin', 'empleado', 'cliente');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_plaza_enum') THEN
          CREATE TYPE "estado_plaza_enum" AS ENUM ('libre', 'ocupada', 'mantenimiento');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_plaza_enum') THEN
          CREATE TYPE "tipo_plaza_enum" AS ENUM ('normal', 'discapacitado', 'electrico');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_reserva_enum') THEN
          CREATE TYPE "estado_reserva_enum" AS ENUM ('activa', 'finalizada', 'cancelada');
        END IF;
      END$$;
    `);

    // Tabla usuarios
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "usuarios" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre" varchar(255) NOT NULL,
        "email" varchar(255) UNIQUE NOT NULL,
        "telefono" varchar(20),
        "password" varchar(255) NOT NULL,
        "role" role_enum NOT NULL DEFAULT 'cliente',
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );
    `);

    // Tabla plazas
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plazas" (
        "id" serial PRIMARY KEY,
        "numero_plaza" varchar(10) UNIQUE NOT NULL,
        "ubicacion" varchar(100),
        "estado" estado_plaza_enum DEFAULT 'libre',
        "tipo" tipo_plaza_enum DEFAULT 'normal',
        "created_at" timestamp DEFAULT now()
      );
    `);

    // Tabla vehiculos
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehiculos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "placa" varchar(20) UNIQUE NOT NULL,
        "marca" varchar(50),
        "modelo" varchar(50),
        "color" varchar(30),
        "usuario_id" uuid,
        "created_at" timestamp DEFAULT now()
      );
    `);

    // Tabla reservas
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reservas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuario_id" uuid,
        "plaza_id" int,
        "vehiculo_id" uuid,
        "fecha_inicio" timestamp NOT NULL,
        "fecha_fin" timestamp NOT NULL,
        "estado" estado_reserva_enum DEFAULT 'activa',
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );
    `);

    // Relaciones
    await queryRunner.query(`
      ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id");
    `);
    await queryRunner.query(`
      ALTER TABLE "reservas" ADD CONSTRAINT "reservas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id");
    `);
    await queryRunner.query(`
      ALTER TABLE "reservas" ADD CONSTRAINT "reservas_plaza_id_fkey" FOREIGN KEY ("plaza_id") REFERENCES "plazas" ("id");
    `);
    await queryRunner.query(`
      ALTER TABLE "reservas" ADD CONSTRAINT "reservas_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos" ("id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar relaciones
    await queryRunner.query(`ALTER TABLE "reservas" DROP CONSTRAINT IF EXISTS "reservas_vehiculo_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "reservas" DROP CONSTRAINT IF EXISTS "reservas_plaza_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "reservas" DROP CONSTRAINT IF EXISTS "reservas_usuario_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "vehiculos" DROP CONSTRAINT IF EXISTS "vehiculos_usuario_id_fkey"`);

    // Eliminar tablas
    await queryRunner.query(`DROP TABLE IF EXISTS "reservas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehiculos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plazas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios"`);

    // Eliminar tipos ENUM
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_reserva_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_plaza_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_plaza_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "role_enum"`);
  }
}