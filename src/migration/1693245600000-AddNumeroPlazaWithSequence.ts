// src/migration/1693245600000-AddNumeroPlazaWithSequence.ts
import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddNumeroPlazaWithSequence1693245600000 implements MigrationInterface {
  name = 'AddNumeroPlazaWithSequence1693245600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna ya existe
    const table = await queryRunner.getTable("plazas");
    const columnExists = table?.columns.some(column => column.name === "numero_plaza");
        
if (!columnExists) {
            await queryRunner.query(`ALTER TABLE "plazas" ADD "numero_plaza" integer`);
            
            // Aquí continúa el resto de tu lógica original de migración
    // 1) Añadir columna numero_plaza permitiendo NULL (temporal)
    await queryRunner.addColumn('plazas', new TableColumn({
      name: 'numero_plaza',
      type: 'integer',
      isNullable: true,
    }));

    // 2) Rellenar valores existentes usando ROW_NUMBER() ORDER BY id
    //    (Esto asigna 1..N a las plazas existentes en orden ascendente por id)
    await queryRunner.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM plazas
      )
      UPDATE plazas p
      SET numero_plaza = n.rn
      FROM numbered n
      WHERE p.id = n.id AND p.numero_plaza IS NULL;
    `);

    // 3) Determinar el valor máximo actual de numero_plaza para arrancar la secuencia
    const maxResult: any = await queryRunner.query(`
      SELECT COALESCE(MAX(numero_plaza), 0) AS max
      FROM plazas;
    `);

    // Nota: result shape depende del driver, asumimos resultado en maxResult[0].max o maxResult[0].max
    let currentMax = 0;
    if (Array.isArray(maxResult) && maxResult.length > 0) {
      // Postgres con node-postgres devuelve array de objetos
      currentMax = parseInt(maxResult[0].max || maxResult[0].max as number || '0', 10);
    } else if (maxResult && typeof maxResult === 'object' && 'max' in maxResult) {
      currentMax = parseInt((maxResult as any).max as string || '0', 10);
    }

    const startValue = currentMax + 1;

    // 4) Crear secuencia para futuros inserts, arrancando en startValue
    //    La secuencia quedará 'OWNED BY' la columna plazas.numero_plaza para limpieza automática si la columna se elimina.
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS plazas_numero_seq START WITH ${startValue} OWNED BY plazas.numero_plaza;
    `);

    // 5) Poner DEFAULT nextval('plazas_numero_seq') en la columna para asignación automática en inserts
    await queryRunner.query(`
      ALTER TABLE plazas ALTER COLUMN numero_plaza SET DEFAULT nextval('plazas_numero_seq');
    `);

    // 6) Asegurar que no haya NULLs y convertir la columna a NOT NULL
    await queryRunner.query(`
      ALTER TABLE plazas ALTER COLUMN numero_plaza SET NOT NULL;
    `);

    // 7) Crear índice único para numero_plaza (constraint de unicidad)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_plazas_numero_plaza_unique ON plazas(numero_plaza);
    `);
            // Por ejemplo, crear una secuencia y establecer valores iniciales
            await queryRunner.query(`CREATE SEQUENCE plazas_numero_plaza_seq`);
            await queryRunner.query(`
                UPDATE "plazas" 
                SET "numero_plaza" = nextval('plazas_numero_plaza_seq') 
                WHERE "numero_plaza" IS NULL
            `);
            await queryRunner.query(`
                ALTER TABLE "plazas" 
                ALTER COLUMN "numero_plaza" 
                SET DEFAULT nextval('plazas_numero_plaza_seq')
            `);
        } else {
            console.log('La columna numero_plaza ya existe. Saltando esta migración.');
        }

    
  }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revertir los cambios en orden inverso
        await queryRunner.query(`ALTER TABLE "plazas" ALTER COLUMN "numero_plaza" DROP DEFAULT`);
        await queryRunner.query(`DROP SEQUENCE IF EXISTS plazas_numero_plaza_seq`);
        await queryRunner.query(`ALTER TABLE "plazas" DROP COLUMN "numero_plaza"`);
    }

}
