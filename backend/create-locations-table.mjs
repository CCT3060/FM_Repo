import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

console.log("Connecting to:", process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ":***@"));

try {
  // 1. Check if table already exists
  const check = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'locations'
    ) AS exists
  `);
  console.log("Table exists:", check.rows[0].exists);

  if (!check.rows[0].exists) {
    console.log("Creating locations table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id bigserial PRIMARY KEY,
        company_id bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name varchar(200) NOT NULL,
        campus varchar(160),
        building varchar(160),
        floor varchar(80),
        room varchar(160),
        qr_code varchar(255),
        status varchar(16) NOT NULL DEFAULT 'Active',
        created_by bigint REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_locations_company ON locations(company_id)`);
    console.log("✓ locations table created");
  } else {
    console.log("✓ Table already exists");
  }

  // 2. Check checklist_templates columns
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'checklist_templates'
    AND column_name IN ('service_type', 'location_id')
  `);
  const existingCols = cols.rows.map(r => r.column_name);
  console.log("checklist_templates extra cols found:", existingCols);

  if (!existingCols.includes('service_type')) {
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS service_type varchar(60)`);
    console.log("✓ Added service_type column");
  }
  if (!existingCols.includes('location_id')) {
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS location_id bigint`);
    console.log("✓ Added location_id column");
  }

  // 3. Test a simple insert/select to confirm it works
  const testCompany = await pool.query(`SELECT id FROM companies LIMIT 1`);
  if (testCompany.rows.length) {
    const cid = testCompany.rows[0].id;
    const ins = await pool.query(`
      INSERT INTO locations (company_id, name, status)
      VALUES ($1, '__test__', 'Active')
      RETURNING id, name
    `, [cid]);
    console.log("✓ Test insert OK:", ins.rows[0]);
    await pool.query(`DELETE FROM locations WHERE name = '__test__'`);
    console.log("✓ Test cleanup OK");
  }

  console.log("\n✅ All done. Restart the backend server now.");
} catch (err) {
  console.error("❌ Error:", err.message);
  console.error("Detail:", err.detail || "");
} finally {
  await pool.end();
}
