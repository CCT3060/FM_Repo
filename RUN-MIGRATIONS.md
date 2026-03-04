# Run Database Migrations

The assignment system requires new database tables. Execute these SQL files in your Supabase SQL editor:

## Required Migrations (in order):

### 1. User Portal Hierarchy
**File:** `backend/sql/migrations/2026-02-28-user-portal-hierarchy.sql`
**Creates:**
- `supervisor_id` column in `company_users` table
- `template_user_assignments` table for tracking assignments

### 2. Submission Tables
**File:** `backend/sql/migrations/2026-02-28-submission-tables.sql`
**Creates:**
- `checklist_submissions` table
- `checklist_submission_answers` table
- Updates to `logsheet_entries` table

### 3. Flag System
**File:** `backend/sql/migrations/2026-02-28-flags-system.sql`
**Creates:**
- `flags` table – stores all checklist/logsheet/manual flags with severity, status, escalation
- `flag_history` table – audit trail of every status change
- `open_flags_count` + `health_status` columns added to `assets`
- `flag_id` column and FK added to `work_orders`

### 4. Work Orders Portal Columns
**File:** `backend/sql/migrations/2026-03-04-work-orders-portal.sql`
**Creates:**
- `company_id`, `flag_id`, `assigned_note`, `closed_at` columns on `work_orders`
- `cp_assigned_to`, `cp_created_by` columns referencing `company_users`

### 5. Work Orders Fixes *(run if assign/status returns 500)*
**File:** `backend/sql/migrations/2026-03-04-work-orders-fixes.sql`
**Creates:**
- Makes `asset_id` nullable on `work_orders` (allows creating WOs without a linked asset)
- Adds `updated_at` and ensures `closed_at` columns exist

## How to Run:

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy the content of each migration file (in order)
4. Paste and run in SQL editor
5. Verify no errors

## After Running:

The mobile app will work correctly because:
- Empty assignments will show "No Assignments" message
- Once you create assignments via web portal, they'll appear
- Submissions will be saved properly

## Testing the Assignment Flow:

1. **Web Portal** → Login as company admin
2. Go to **Employees** section
3. Assign a checklist/logsheet to a supervisor
4. **Mobile App** → Login as supervisor
5. See the assignment in "My Assignments"
6. Tap "Fill Now" to submit responses
7. **Web Portal** → View submissions at `/company/submissions`
