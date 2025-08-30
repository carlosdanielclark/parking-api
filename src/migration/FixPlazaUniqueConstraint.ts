import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPlazaUniqueConstraint1724857957000 implements MigrationInterface {
    name = 'FixPlazaUniqueConstraint1724857957000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Identificar y manejar duplicados
        await queryRunner.query(`
            -- Crear tabla temporal para manejar duplicados
            CREATE TEMP TABLE plaza_duplicates AS
            SELECT numero_plaza, COUNT(*) as count, MIN(id) as keep_id
            FROM plazas 
            GROUP BY numero_plaza 
            HAVING COUNT(*) > 1;
        `);

        // 2. Actualizar duplicados con números únicos
        await queryRunner.query(`
            UPDATE plazas 
            SET numero_plaza = numero_plaza + (
                SELECT ROW_NUMBER() OVER (ORDER BY id) * 10000
                FROM plazas p2 
                WHERE p2.numero_plaza = plazas.numero_plaza 
                AND p2.id != (
                    SELECT keep_id 
                    FROM plaza_duplicates pd 
                    WHERE pd.numero_plaza = plazas.numero_plaza
                )
                AND p2.id = plazas.id
            )
            WHERE id NOT IN (
                SELECT keep_id FROM plaza_duplicates
            ) 
            AND numero_plaza IN (
                SELECT numero_plaza FROM plaza_duplicates
            );
        `);

        // 3. Crear el constraint único
        await queryRunner.query(`
            ALTER TABLE "plazas" 
            ADD CONSTRAINT "UQ_plazas_numero_plaza" 
            UNIQUE ("numero_plaza");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rollback: eliminar constraint
        await queryRunner.query(`
            ALTER TABLE "plazas" 
            DROP CONSTRAINT IF EXISTS "UQ_plazas_numero_plaza";
        `);
    }
}
