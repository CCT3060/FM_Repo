import pool from './src/db.js';

async function inspectSchema() {
    try {
        console.log("Inspecting checklist_templates foreign keys...");
        const [fks] = await pool.query(`
      SELECT
          tc.table_schema, 
          tc.constraint_name, 
          tc.table_name, 
          kcu.column_name, 
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='checklist_templates';
    `);
        console.log(JSON.stringify(fks, null, 2));

        console.log("\nChecking for user id 11 in users table...");
        const [userRows] = await pool.query("SELECT id FROM users WHERE id = 11");
        console.log("Users with id 11:", userRows);

        console.log("\nChecking for user id 11 in company_users table...");
        const [companyUserRows] = await pool.query("SELECT id FROM company_users WHERE id = 11");
        console.log("Company users with id 11:", companyUserRows);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspectSchema();
