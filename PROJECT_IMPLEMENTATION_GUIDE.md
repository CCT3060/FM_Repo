# FM App — Project Implementation, Architecture & Deployment Guide

> **Server IP:** `3.110.166.39`  
> **Domain:** `https://fm.catalystsolutions.eco`  
> **GitHub:** `https://github.com/Comprehensive-Cloud-Technologies/FM_Repo.git`  
> **Active Branch:** `develop`  
> **Last Updated:** May 27, 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Database ER Diagram](#5-database-er-diagram)
6. [API Reference](#6-api-reference)
7. [User Roles & Access Control](#7-user-roles--access-control)
8. [Deployment Guide (Manual)](#8-deployment-guide-manual)
9. [Server Infrastructure](#9-server-infrastructure)
10. [Environment Variables](#10-environment-variables)
11. [Common Operations & Maintenance](#11-common-operations--maintenance)
12. [Mobile App](#12-mobile-app)

---

## 1. Project Overview

**FM App** (Facility Management App) is a multi-tenant SaaS platform for managing facilities, assets, checklists, logsheets, work orders, and soft-service requests across companies.

### Key Modules

| Module | Description |
|---|---|
| **Client & User Management** | Root admin manages clients (organizations). Each client has users. |
| **Company Portal** | Each client owns companies. Company managers manage assets, departments, templates. |
| **Asset Management** | Track assets (soft/technical/fleet) with QR codes, departments, history. |
| **Checklist Templates** | Create reusable checklist templates, assign to assets, collect daily/weekly submissions. |
| **Logsheet Templates** | Monthly tabular logsheets assigned to assets. |
| **Work Orders** | Raise, track, and resolve maintenance work orders linked to assets. |
| **Soft Service Requests** | Raise and track facility service requests (housekeeping, pantry, etc.). |
| **Flags & Alerts** | Rule-based flag engine for anomaly detection on checklist answers. |
| **Notifications** | In-app notifications for submissions, work orders, flags. |
| **Shifts** | Company-level shift management. |
| **Mobile App** | Expo React Native app for field workers to scan QR, submit checklists, raise work orders. |

---

## 2. System Architecture

```mermaid
graph TB
    subgraph Internet
        Browser["Browser / Web App"]
        Mobile["Mobile App (Expo)"]
    end

    subgraph EC2["EC2 Instance — 3.110.166.39 (ap-south-1)"]
        direction TB
        Nginx["Nginx (Port 80 → 443)\nSSL: Let's Encrypt\nDomain: fm.catalystsolutions.eco"]
        
        subgraph Frontend["Frontend — Static Files"]
            React["React + Vite Build\n/var/www/fmapp/frontend/"]
        end

        subgraph Backend["Backend — Node.js"]
            PM2["PM2 Process Manager"]
            Express["Express.js API\nPort 4000"]
        end

        subgraph Database["Database"]
            PG["PostgreSQL\n127.0.0.1:5432\nDB: fmapp"]
        end

        subgraph Storage["File Storage"]
            Uploads["Uploads\n/var/www/fmapp/backend/uploads/"]
        end
    end

    subgraph GitHub
        Repo["FM_Repo\nbranch: develop"]
    end

    Browser -->|HTTPS 443| Nginx
    Mobile -->|HTTPS API calls| Nginx
    Nginx -->|"/* static files"| React
    Nginx -->|"/api/* proxy"| Express
    Nginx -->|"/uploads/* alias"| Uploads
    Express --> PG
    Express --> Uploads
    Repo -->|git pull on deploy| EC2
```

### Request Flow

```
User Request
    │
    ▼
Nginx (443 SSL)
    ├── /* → serve /var/www/fmapp/frontend/ (React SPA)
    ├── /api/* → proxy to http://localhost:4000 (Express)
    ├── /uploads/* → alias /var/www/fmapp/backend/uploads/
    └── /health → proxy to http://localhost:4000/health
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Frontend** | React | 18+ |
| **Frontend Build** | Vite | 7.x |
| **Frontend Routing** | React Router DOM | v6 |
| **Frontend Icons** | Lucide React | — |
| **Backend Runtime** | Node.js | 18+ (ESM) |
| **Backend Framework** | Express.js | 4.x |
| **Authentication** | JWT (jsonwebtoken) + bcryptjs | — |
| **Database** | PostgreSQL | 14+ |
| **DB Client** | pg (node-postgres) | 8.x |
| **Process Manager** | PM2 | — |
| **Web Server** | Nginx | — |
| **Mobile** | Expo (React Native) | SDK 52+ |
| **Mobile Language** | TypeScript | — |
| **Validation** | express-validator | 7.x |
| **File Upload** | Multer | 2.x |
| **AI** | OpenAI SDK | 6.x |
| **Excel** | xlsx | — |

---

## 4. Directory Structure

```
/var/www/fmapp/              ← App root on EC2
├── backend/                 ← Node.js API
│   ├── src/
│   │   ├── app.js           ← Express app setup, routes registration
│   │   ├── server.js        ← HTTP server entry point
│   │   ├── db.js            ← PostgreSQL connection pool
│   │   ├── validators.js    ← Shared express-validator rules
│   │   ├── middleware/      ← Auth middleware, etc.
│   │   └── routes/          ← One file per API resource
│   │       ├── auth.js
│   │       ├── clients.js
│   │       ├── users.js
│   │       ├── companies.js
│   │       ├── assets.js
│   │       ├── assetTypes.js
│   │       ├── assetQR.js
│   │       ├── assetDashboard.js
│   │       ├── departments.js
│   │       ├── checklists.js
│   │       ├── templateChecklists.js
│   │       ├── templateAssignments.js
│   │       ├── templateLogs.js
│   │       ├── logs.js
│   │       ├── submissionReports.js
│   │       ├── companyAuth.js
│   │       ├── companyPortal.js
│   │       ├── companyPortalAssetDashboard.js
│   │       ├── companyRoles.js
│   │       ├── companyUsers.js
│   │       ├── mobileAuth.js
│   │       ├── shifts.js
│   │       ├── flags.js
│   │       ├── flagRules.js
│   │       ├── notifications.js
│   │       ├── softServiceRequests.js
│   │       ├── templateImport.js
│   │       └── upload.js
│   ├── sql/
│   │   ├── schema.sql       ← Base schema (run once on new DB)
│   │   └── migrations/      ← Incremental schema changes (run in order)
│   ├── uploads/
│   │   └── logos/           ← Company logo uploads
│   └── .env                 ← Secret config (never committed to git)
│
├── frontend/                ← React built files (nginx serves this)
│   ├── index.html           ← Entry point (built by Vite)
│   └── assets/              ← Hashed JS/CSS bundles
│
└── ec2/                     ← Server config files
    ├── deploy.sh            ← Deployment script
    ├── pm2.ecosystem.config.js ← PM2 config
    ├── nginx.conf           ← Reference nginx config
    └── fmapp-live.conf      ← Active nginx config (deployed to /etc/nginx/conf.d/)
```

---

## 5. Database ER Diagram

```mermaid
erDiagram
    clients {
        int id PK
        varchar client_name
        varchar email
        varchar phone
        varchar company_name
        varchar state_name
        varchar gst_number
        enum status
        timestamp created_at
    }

    users {
        int id PK
        int client_id FK
        varchar full_name
        varchar email
        varchar role
        varchar password_hash
        enum status
    }

    companies {
        int id PK
        int user_id FK
        varchar company_name
        varchar company_code
        varchar city
        varchar state_name
        date contract_start_date
        date contract_end_date
        int max_employees
        enum status
    }

    departments {
        int id PK
        int company_id FK
        varchar name
    }

    asset_types {
        int id PK
        int company_id FK
        varchar name
        varchar category
    }

    assets {
        int id PK
        int company_id FK
        int department_id FK
        int created_by FK
        varchar asset_name
        varchar asset_unique_id
        enum asset_type
        varchar qr_code
        enum status
    }

    asset_details {
        int id PK
        int asset_id FK
        json metadata
        json documents
    }

    asset_history {
        int id PK
        int asset_id FK
        int created_by FK
        varchar action
        json details
    }

    asset_checklists {
        int id PK
        int asset_id FK
        varchar name
        enum asset_category
    }

    asset_checklist_items {
        int id PK
        int checklist_id FK
        varchar title
        enum answer_type
        int is_required
    }

    asset_checklist_submissions {
        int id PK
        int checklist_id FK
        int asset_id FK
        int submitted_by FK
        date submitted_date
        varchar shift
    }

    asset_checklist_item_responses {
        int id PK
        int submission_id FK
        int item_id FK
        varchar answer_value
        int is_flagged
    }

    checklist_templates {
        int id PK
        int company_id FK
        int created_by FK
        varchar template_name
        varchar asset_type
        enum frequency
        json custom_hours
        varchar shift
        enum status
    }

    checklist_template_questions {
        int id PK
        int template_id FK
        varchar question_text
        enum input_type
        json options_json
    }

    checklist_assignments {
        int id PK
        int template_id FK
        int asset_id FK
        int assigned_by FK
    }

    checklist_submissions {
        int id PK
        int template_id FK
        int asset_id FK
        int submitted_by FK
        date submission_date
        varchar shift
        json answers
        enum status
    }

    checklist_submission_answers {
        int id PK
        int submission_id FK
        int question_id FK
        varchar answer_value
        int is_flagged
        varchar flag_reason
    }

    logsheet_templates {
        int id PK
        int company_id FK
        varchar template_name
        varchar asset_type
        enum frequency
        varchar shift
    }

    logsheet_sections {
        int id PK
        int template_id FK
        varchar section_name
        int order_index
    }

    logsheet_questions {
        int id PK
        int section_id FK
        varchar question_text
        enum answer_type
        json rule_json
    }

    logsheet_template_assignments {
        int id PK
        int template_id FK
        int asset_id FK
        int attached_by FK
    }

    logsheet_entries {
        int id PK
        int template_id FK
        int asset_id FK
        int submitted_by FK
        date entry_date
        tinyint month
        smallint year
        json data
    }

    logsheet_answers {
        int id PK
        int entry_id FK
        int question_id FK
        tinyint date_column
        varchar answer_value
        int is_issue
    }

    work_orders {
        int id PK
        int company_id FK
        int asset_id FK
        int raised_by FK
        int assigned_to FK
        varchar title
        text description
        enum priority
        enum status
        date due_date
    }

    work_order_history {
        int id PK
        int work_order_id FK
        int changed_by FK
        varchar old_status
        varchar new_status
    }

    company_users {
        int id PK
        int company_id FK
        varchar username
        varchar full_name
        varchar email
        varchar password_hash
        varchar role
        enum status
    }

    company_roles {
        int id PK
        int company_id FK
        varchar role_name
        json permissions
    }

    flags {
        int id PK
        int company_id FK
        int asset_id FK
        int submission_id FK
        varchar flag_type
        varchar severity
        enum status
        text description
    }

    soft_service_requests {
        int id PK
        int company_id FK
        int department_id FK
        int raised_by FK
        varchar title
        text description
        enum category
        enum priority
        enum status
    }

    notifications {
        int id PK
        int company_id FK
        int user_id FK
        varchar title
        text message
        varchar type
        int is_read
    }

    template_user_assignments {
        int id PK
        int template_id FK
        int company_user_id FK
        varchar template_type
    }

    clients ||--o{ users : "has"
    users ||--o{ companies : "owns"
    companies ||--o{ departments : "has"
    companies ||--o{ assets : "has"
    companies ||--o{ checklist_templates : "has"
    companies ||--o{ logsheet_templates : "has"
    companies ||--o{ work_orders : "has"
    companies ||--o{ company_users : "has"
    companies ||--o{ company_roles : "has"
    companies ||--o{ soft_service_requests : "has"
    companies ||--o{ notifications : "has"
    departments ||--o{ assets : "in"
    assets ||--o| asset_details : "has"
    assets ||--o{ asset_history : "has"
    assets ||--o{ asset_checklists : "has"
    assets ||--o{ checklist_assignments : "assigned"
    assets ||--o{ logsheet_template_assignments : "assigned"
    assets ||--o{ work_orders : "linked"
    asset_checklists ||--o{ asset_checklist_items : "has"
    asset_checklist_items ||--o{ asset_checklist_item_responses : "answered"
    checklist_templates ||--o{ checklist_template_questions : "has"
    checklist_templates ||--o{ checklist_assignments : "assigned"
    checklist_templates ||--o{ checklist_submissions : "submitted"
    checklist_submissions ||--o{ checklist_submission_answers : "has"
    logsheet_templates ||--o{ logsheet_sections : "has"
    logsheet_sections ||--o{ logsheet_questions : "has"
    logsheet_templates ||--o{ logsheet_template_assignments : "assigned"
    logsheet_entries ||--o{ logsheet_answers : "has"
    work_orders ||--o{ work_order_history : "has"
    flags ||--o{ flags : "linked"
    template_user_assignments }o--|| company_users : "assigned to"
```

---

## 6. API Reference

### Base URL
- **Production:** `https://fm.catalystsolutions.eco/api`
- **Local Dev:** `http://localhost:4000/api`

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/auth/login` | Root admin login | No |
| POST | `/company-auth/login` | Company user login | No |
| POST | `/mobile-auth/login` | Mobile app login | No |
| POST | `/mobile-auth/refresh` | Refresh mobile JWT | Yes |

### Root Admin Endpoints (JWT required)

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/clients` | List / Create clients |
| GET/PUT/DELETE | `/clients/:id` | Get / Update / Delete client |
| GET/POST | `/users` | List / Create users |
| GET/PUT/DELETE | `/users/:id` | Get / Update / Delete user |
| GET/POST | `/companies` | List / Create companies |
| GET/PUT/DELETE | `/companies/:id` | Get / Update / Delete company |

### Company Portal Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/company-portal/dashboard` | Dashboard summary |
| GET | `/company-portal/assets` | All assets for company |
| GET | `/company-portal/submissions` | Checklist submissions |
| GET | `/company-portal/asset-dashboard` | Asset dashboard data |
| GET/POST | `/departments` | Departments |
| GET/POST | `/assets` | Assets CRUD |
| POST | `/asset-qr/generate` | Generate QR code for asset |
| GET/POST | `/checklist-templates` | Checklist templates |
| POST | `/template-assignments` | Assign template to asset |
| GET/POST | `/checklists` | Checklist submissions |
| GET/POST | `/logsheet-templates` | Logsheet templates |
| GET/POST | `/logs` | Logsheet entries |
| GET/POST | `/company-users` | Company employee management |
| GET/POST | `/company-portal/roles` | Custom roles |
| GET/POST | `/shifts` | Shift management |
| GET/POST | `/flags` | Flag management |
| GET/POST | `/flag-rules` | Flag rules |
| GET/POST | `/notifications` | Notifications |
| POST | `/soft-service-requests` | Raise soft service request |
| GET | `/submission-reports` | Submission analytics |
| POST | `/upload` | Upload logo/files |

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` or `/api/health` | Returns `{"status":"ok","db":"connected"}` |

---

## 7. User Roles & Access Control

### Role Hierarchy

```
Root Admin (rootadmin / Root@12345)
    │ — Manages all clients, users, companies
    │
    ▼
Client User (JWT auth via /api/auth/login)
    │ — Manages companies belonging to their client
    │
    ▼
Company User (JWT auth via /api/company-auth/login)
    │ — Role: manager / supervisor / technician / custom
    │ — Manages assets, templates, submissions within company
    │
    ▼
Mobile App User (JWT auth via /api/mobile-auth/login)
    │ — Field worker: scans QR, submits checklists, raises work orders
```

### Root Admin Login (Frontend)
- **Username:** `rootadmin`
- **Password:** `Root@12345`
- Stored as constants in `frontend/src/App.jsx` (client-side only, no API call)

### Company User Permissions (company_roles table)
Permissions are stored as JSON in `company_roles.permissions`. Roles are custom per company (e.g., Manager, Supervisor, Technician, Housekeeper).

---

## 8. Deployment Guide (Manual)

### Prerequisites on Your Local Machine
- Git installed
- SSH key at `C:\Users\RahulSonawane\.ssh\Key.pem`
- Access to GitHub repo

### Step-by-Step: Deploy to EC2

#### Step 1 — Commit & Push Code Locally
```powershell
cd F:\Projects\fm3\FM_Repo

# Stage your changes (avoid node_modules)
git add backend/src/ frontend/src/ mobile-app-v2/

git commit -m "your description of changes"

git push origin develop
```

#### Step 2 — SSH into EC2
```bash
ssh -i "C:\Users\RahulSonawane\.ssh\Key.pem" ec2-user@3.110.166.39
```

#### Step 3 — Pull Latest Code on Server
```bash
cd /var/www/fmapp
git pull origin develop
```

#### Step 4 — Install Backend Dependencies
```bash
cd /var/www/fmapp/backend
npm install --omit=dev
```

#### Step 5 — Run New Database Migrations (if any)
```bash
cd /var/www/fmapp/backend
# Check what's in the migrations folder
ls sql/migrations/

# Apply a specific migration manually via psql
source .env
psql "$DATABASE_URL" < sql/migrations/MIGRATION_FILE_NAME.sql
```

#### Step 6 — Build Frontend
```bash
cd /var/www/fmapp/frontend
npm install
npm run build

# Safely move built files to nginx root
cp -r dist /tmp/fmapp-dist-new
rm -rf /var/www/fmapp/frontend
cp -r /tmp/fmapp-dist-new /var/www/fmapp/frontend
```

> **Important:** Always copy `dist/` to `/tmp` before removing `frontend/`, otherwise `rm -rf` deletes `dist/` too.

#### Step 7 — Restart Backend
```bash
pm2 reload fmapp-backend --update-env
pm2 status
```

#### Step 8 — Reload Nginx
```bash
sudo systemctl reload nginx
```

#### Step 9 — Verify Deployment
```bash
# Backend health
curl http://localhost:4000/health

# From browser: https://fm.catalystsolutions.eco
```

---

### One-Command Deploy from Local (after code is pushed)

```powershell
ssh -i "C:\Users\RahulSonawane\.ssh\Key.pem" ec2-user@3.110.166.39 @"
set -e
echo '=== Pulling code ==='
cd /var/www/fmapp && git pull origin develop

echo '=== Backend deps ==='
cd /var/www/fmapp/backend && npm install --omit=dev

echo '=== Building frontend ==='
cd /var/www/fmapp/frontend && npm install && npm run build
cp -r dist /tmp/fmapp-dist-deploy
rm -rf /var/www/fmapp/frontend
cp -r /tmp/fmapp-dist-deploy /var/www/fmapp/frontend

echo '=== Restarting backend ==='
pm2 reload fmapp-backend --update-env

echo '=== Reloading nginx ==='
sudo systemctl reload nginx

echo '=== Done! ==='
pm2 status
curl -s http://localhost:4000/health
"@
```

---

### Adding a New SQL Migration

1. Create file: `backend/sql/migrations/YYYY-MM-DD-description.sql`
2. Write idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
3. Push to GitHub
4. On EC2: `psql "$DATABASE_URL" < sql/migrations/YYYY-MM-DD-description.sql`

---

### Updating the Backend `.env` on EC2

```bash
ssh -i "C:\Users\RahulSonawane\.ssh\Key.pem" ec2-user@3.110.166.39
nano /var/www/fmapp/backend/.env
# Edit → Ctrl+O to save → Ctrl+X to exit
pm2 reload fmapp-backend --update-env
```

---

## 9. Server Infrastructure

### EC2 Instance Details

| Property | Value |
|---|---|
| **IP** | `3.110.166.39` |
| **Region** | `ap-south-1` (Mumbai) |
| **OS** | Amazon Linux 2023 |
| **User** | `ec2-user` |
| **App Root** | `/var/www/fmapp` |
| **SSH Key** | `C:\Users\RahulSonawane\.ssh\Key.pem` |

### Running Services

| Service | Command | Status |
|---|---|---|
| **Backend API** | `pm2 status` | `fmapp-backend` on port 4000 |
| **Nginx** | `sudo systemctl status nginx` | Active |
| **PostgreSQL** | `sudo systemctl status postgresql` | Active on 5432 |

### PM2 Commands

```bash
pm2 status                          # List all processes
pm2 logs fmapp-backend              # Live logs
pm2 logs fmapp-backend --lines 100  # Last 100 log lines
pm2 reload fmapp-backend            # Zero-downtime reload
pm2 restart fmapp-backend           # Hard restart
pm2 stop fmapp-backend              # Stop
pm2 save                            # Save process list (survives reboot)
pm2 startup                         # Generate systemd startup script
```

### Nginx Commands

```bash
sudo nginx -t                       # Test config syntax
sudo systemctl reload nginx         # Reload config (no downtime)
sudo systemctl restart nginx        # Full restart
sudo systemctl status nginx         # Status
sudo cat /etc/nginx/conf.d/fmapp-live.conf  # View active config
```

### PostgreSQL Commands

```bash
# Connect to DB
source /var/www/fmapp/backend/.env
psql "$DATABASE_URL"

# List tables
\dt

# Check connections
SELECT count(*) FROM pg_stat_activity;

# Exit
\q
```

### Disk & Process Monitoring

```bash
df -h                               # Disk usage
free -h                             # Memory usage
htop                                # CPU/memory live
pm2 monit                           # PM2 live monitoring
```

---

## 10. Environment Variables

File location on EC2: `/var/www/fmapp/backend/.env`

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://fmapp:PASSWORD@127.0.0.1:5432/fmapp` |
| `DB_POOL_SIZE` | PG connection pool size | `10` |
| `PORT` | API server port | `4000` |
| `ALLOW_ORIGIN` | CORS allowed origins (comma-separated) | `https://fm.catalystsolutions.eco` |
| `JWT_SECRET` | Secret for signing JWTs | Long random string |
| `SUPABASE_DB_SSL` | Disable SSL for local PG | `disable` |

> **Never commit `.env` to git.** It is in `.gitignore`.

---

## 11. Common Operations & Maintenance

### Add a New API Route

1. Create `backend/src/routes/myFeature.js`
2. Import and register in `backend/src/app.js`:
   ```js
   import myFeatureRouter from './routes/myFeature.js';
   app.use('/api/my-feature', myFeatureRouter);
   ```
3. Push and deploy

### Add a New Frontend Page

1. Create `frontend/src/pages/MyPage.jsx`
2. Add route in `frontend/src/App.jsx`:
   ```jsx
   import MyPage from './pages/MyPage';
   // Inside <Routes>:
   <Route path="/my-page" element={<MyPage />} />
   ```
3. Push and deploy

### Uploading Company Logos

- Logos are uploaded via `POST /api/upload`
- Stored at `/var/www/fmapp/backend/uploads/logos/`
- Served via nginx at `/uploads/logos/filename.png`

### View Backend Errors

```bash
ssh -i "C:\Users\RahulSonawane\.ssh\Key.pem" ec2-user@3.110.166.39 "pm2 logs fmapp-backend --lines 50"
```

### SSL Certificate Renewal (Let's Encrypt)

```bash
ssh -i "C:\Users\RahulSonawane\.ssh\Key.pem" ec2-user@3.110.166.39
sudo certbot renew --dry-run       # Test renewal
sudo certbot renew                 # Actual renewal
sudo systemctl reload nginx
```

### Rollback to Previous Version

```bash
ssh -i "C:\Users\RahulSonawane\.ssh\Key.pem" ec2-user@3.110.166.39
cd /var/www/fmapp
git log --oneline -10              # Find the commit to rollback to
git checkout COMMIT_HASH           # Rollback code
# Then re-run backend install, frontend build, pm2 reload steps
```

---

## 12. Mobile App

### Location
`mobile-app-v2/` — Expo React Native (TypeScript)

### Key Files

| File | Purpose |
|---|---|
| `app/_layout.tsx` | Root layout, navigation setup |
| `app/login.tsx` | Mobile login screen |
| `app/assets.tsx` | Asset listing |
| `app/qr-scanner.tsx` | QR code scanner to identify assets |
| `app/checklist-entry.tsx` | Submit checklist responses |
| `app/work-orders.tsx` | Work order listing |
| `app/work-order-create.tsx` | Raise a work order |
| `app/soft-raise.tsx` | Raise a soft service request |
| `context/AuthContext.tsx` | Global auth state |
| `utils/api.ts` | All API call functions |
| `utils/offlineStorage.ts` | Offline data caching |
| `utils/notifications.ts` | Push notification setup |

### Running Locally
```bash
cd mobile-app-v2
npx expo start --go --lan
```

### API Base URL (in `utils/api.ts`)
Points to: `https://fm.catalystsolutions.eco/api`

### Building for Production (EAS)
```bash
cd mobile-app-v2
eas build --platform android --profile production
eas submit -p android
```

---

*Document generated May 27, 2026 — FM App v1.0*
