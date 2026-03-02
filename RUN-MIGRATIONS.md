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
