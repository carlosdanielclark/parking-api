import { MigrationInterface, QueryRunner } from "typeorm";

export class DescripcionDelCambio1756405970637 implements MigrationInterface {
    name = 'DescripcionDelCambio1756405970637'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "plazas"."numero_plaza" IS 'Número único identificativo de la plaza'`);
        await queryRunner.query(`ALTER TABLE "plazas" ALTER COLUMN "numero_plaza" DROP DEFAULT`);
        await queryRunner.query(`DROP SEQUENCE "plazas_numero_plaza_seq"`);
        await queryRunner.query(`ALTER TABLE "plazas" DROP COLUMN "ubicacion"`);
        await queryRunner.query(`ALTER TABLE "plazas" ADD "ubicacion" character varying(120)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plazas" DROP COLUMN "ubicacion"`);
        await queryRunner.query(`ALTER TABLE "plazas" ADD "ubicacion" character varying(100)`);
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "plazas_numero_plaza_seq" OWNED BY "plazas"."numero_plaza"`);
        await queryRunner.query(`ALTER TABLE "plazas" ALTER COLUMN "numero_plaza" SET DEFAULT nextval('"plazas_numero_plaza_seq"')`);
        await queryRunner.query(`COMMENT ON COLUMN "plazas"."numero_plaza" IS NULL`);
    }

}
