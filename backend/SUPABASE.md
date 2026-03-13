# Supabase Migration Notes

1. **Provision the database**
   - Create a new Supabase project and collect the **Session Pooler** `DATABASE_URL` ("Connect" → "Session pooler").
   - For Elastic Beanstalk / IPv4-only networks, prefer session pooler over direct `db.<ref>.supabase.co` endpoints.
   - Enable "Require SSL" on the project or keep the default; the backend assumes SSL is required unless `SUPABASE_DB_SSL=disable`.

2. **Apply the schema**
   - Run the SQL script at `sql/supabase/schema.sql` inside the Supabase SQL editor or via `psql`:
     ```bash
     psql "$DATABASE_URL" -f sql/supabase/schema.sql
     ```
   - This script already includes the schema deltas and seeds the default asset types.

3. **Load existing data (optional)**
   - If you have data in the old MySQL instance, export it (e.g. `mysqldump --no-create-info`).
   - Use a migration tool such as `pgloader` or Supabase's "Data import" to map the data into Postgres tables created above.

4. **Configure environment variables**
   - Update `.env` (base it on `.env.example`) with:
     ```ini
       DATABASE_URL=postgresql://postgres.<project-ref>:<url-encoded-password>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
     SUPABASE_DB_SSL=require
     DB_POOL_SIZE=10
     JWT_SECRET=your_application_secret
     ALLOW_ORIGIN=http://localhost:5173
     ```
    - If your password contains special characters (for example `@`), URL-encode it in `DATABASE_URL` (for example `@` → `%40`).
   - Remove the old `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` keys.

5. **Install dependencies & run**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

6. **Production notes**
   - Expose `DATABASE_URL` via your hosting provider's secret manager.
   - If API requests fail with IPv6 routing errors (`ENETUNREACH`) on hosts like Elastic Beanstalk, switch to a Session Pooler URL.
   - If you see `Circuit breaker open: Too many authentication errors`, reset DB password in Supabase and update `DATABASE_URL` with the new password.
   - Supabase Postgres enforces idle timeouts via PgBouncer. The new `pg` pool keeps connections short-lived, but prefer serverless deployments that reuse the pool.
   - If you need per-table RLS policies later, keep this Node backend as the trusted service client and connect with the `service_role` credential held in `DATABASE_URL`.
