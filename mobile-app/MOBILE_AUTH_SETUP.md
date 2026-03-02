# Mobile App Authentication Setup Guide

## Overview
The mobile app now supports authentication for employees and supervisors using username/password credentials. Employees added via the company portal can log in to the mobile app and access their respective dashboards.

## Backend Changes

### 1. Database Migration
**File:** `backend/sql/migrations/2026-02-28-company-users-username.sql`

Added `username` column to the `company_users` table:
```sql
ALTER TABLE company_users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_username ON company_users(LOWER(username));
```

**⚠️ IMPORTANT:** Run this migration in Supabase SQL editor before testing:
1. Open Supabase dashboard → SQL Editor
2. Copy and paste the contents of `backend/sql/migrations/2026-02-28-company-users-username.sql`
3. Click "Run"

### 2. Mobile Authentication API
**File:** `backend/src/routes/mobileAuth.js`

New endpoints for mobile app authentication:

- **POST `/api/mobile-auth/login`**
  - Request: `{ username: string, password: string }`
  - Response: `{ token: string, user: {...} }`
  - Returns JWT token (expires in 30 days) and user details

- **GET `/api/mobile-auth/verify`**
  - Headers: `Authorization: Bearer <token>`
  - Response: `{ user: {...} }`
  - Validates token and returns fresh user data

### 3. Company Portal Updates
**File:** `backend/src/routes/companyPortal.js`

Updated employee management endpoints:
- `POST /api/company-portal/employees` - Now accepts `username` field
- `PUT /api/company-portal/employees/:id` - Can update username
- `GET /api/company-portal/employees` - Returns username in response

## Frontend (Admin Portal) Changes

### Employee Modal
**File:** `frontend/src/pages/CompanyEmployeePortal.jsx`

Added "Mobile App Access" section with:
- Username field (required for new employees)
- Password field (required for new employees)
- Visual indicator showing when mobile access is enabled
- Validation to ensure username is provided

## Mobile App Changes

### 1. API Client Utility
**File:** `mobile-app/utils/api.ts`

Created comprehensive API client with:
- `loginEmployee(username, password)` - Authenticate user
- `verifyToken()` - Validate stored token
- `getAuthToken()` - Get stored JWT token
- `getStoredUser()` - Get stored user data
- `clearAuth()` - Logout functionality
- `authenticatedFetch()` - Helper for authenticated requests

**Configuration:**
- Update `API_BASE` constant in `mobile-app/utils/api.ts`
- For Android emulator: `http://10.0.2.2:4000`
- For iOS simulator: `http://localhost:4000`
- For physical device: `http://YOUR_LOCAL_IP:4000`
- For production: Set your production URL

### 2. Login Screen
**File:** `mobile-app/app/employee-login.tsx`

Enhanced login screen with:
- Real API authentication (replaces hardcoded routing)
- Username field (instead of "Employee ID or Email")
- Loading state during authentication
- Error handling with user-friendly messages
- Role-based routing (supervisor → tech-dashboard, employee → dashboard)

### 3. Auto-Login
**File:** `mobile-app/app/index.tsx`

Added auto-login functionality:
- Checks for stored token on app launch
- Verifies token with backend
- Automatically routes to appropriate dashboard if token is valid
- Shows loading screen during verification

## Testing the Feature

### Prerequisites
1. Run the database migration in Supabase
2. Backend server running on port 4000
3. Update `API_BASE` in `mobile-app/utils/api.ts` with correct URL
4. Install dependencies: `cd mobile-app && npm install`

### Testing Steps

#### 1. Create an Employee (Web Portal)
1. Open `http://localhost:5173` (or your frontend URL)
2. Log in to company portal
3. Navigate to Employee Management
4. Click "Add Employee"
5. Fill in employee details:
   - Full Name: Ahmad Hassan
   - Email: ahmad@example.com
   - Role: Employee (or Supervisor)
   - Status: Active
   - **Username:** ahmad.hassan
   - **Password:** Test1234
6. Click "Create Employee"

#### 2. Test Mobile App Login
1. Start the mobile app: `cd mobile-app && npm start`
2. Press 'a' for Android or 'i' for iOS
3. On the company code screen, click "Sign in" (currently bypasses company code)
4. Enter credentials:
   - Username: ahmad.hassan
   - Password: Test1234
5. Click "Sign in"
6. Should navigate to appropriate dashboard based on role

#### 3. Test Auto-Login
1. Close and reopen the mobile app
2. Should automatically navigate to dashboard (no login required)
3. Token remains valid for 30 days

#### 4. Test Different Roles
- **Employee:** Routes to `/dashboard` (standard employee dashboard)
- **Supervisor:** Routes to `/tech-dashboard` (supervisor portal with tasks)

## Authentication Flow

```
┌─────────────────────┐
│   App Launch        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Stored Token  │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
    Yes         No
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────┐
│ Verify  │  │ Show Login  │
│ Token   │  │   Screen    │
└────┬────┘  └──────┬──────┘
     │              │
Valid│Invalid       │Enter Credentials
     │              │
     ▼              ▼
┌─────────────────────┐
│  POST /login API    │
│  Store JWT Token    │
└──────────┬──────────┘
           │
           ▼
     ┌─────┴─────┐
     │           │
Supervisor    Employee
     │           │
     ▼           ▼
┌──────────┐  ┌──────────┐
│  Tech    │  │Employee  │
│Dashboard │  │Dashboard │
└──────────┘  └──────────┘
```

## Security Features

1. **Password Hashing:** Passwords are hashed using bcrypt before storage
2. **JWT Tokens:** Secure JWT tokens with 30-day expiration
3. **Case-Insensitive Usernames:** Unique constraint on lowercase username
4. **Token Verification:** Tokens are validated on each app launch
5. **Secure Storage:** Tokens stored in AsyncStorage (consider using expo-secure-store for production)

## Future Enhancements

1. **Logout Button:** Add logout functionality to dashboard headers
2. **Company Code Validation:** Implement actual company code verification
3. **Token Refresh:** Add automatic token refresh before expiration
4. **Biometric Authentication:** Add fingerprint/face ID support
5. **Password Reset:** Implement forgot password functionality
6. **Secure Storage:** Use expo-secure-store instead of AsyncStorage for production

## Troubleshooting

### Login Stays on Same Page (No Navigation)

**Symptoms:** After entering credentials and clicking "Sign in", the button shows a loading spinner but nothing happens - stays on login screen.

**Common Causes & Solutions:**

1. **Network Connection Issue - Backend server not reachable**
   - **Check:** Open Terminal and run `Invoke-WebRequest -Uri http://localhost:4000/health -UseBasicParsing`
   - **Expected:** Should show `StatusCode: 200` and `Content: {"status":"ok"}`
   - **Fix if failing:** Start backend server with `cd d:\projects\FM\FM_Repo\backend; node src/server.js`

2. **Wrong API_BASE URL for your platform**
   - **For Android Emulator:** Should use `http://10.0.2.2:4000`
   - **For iOS Simulator:** Should use `http://localhost:4000`  
   - **For Physical Device:** Must use your computer's local IP (e.g., `http://192.168.1.100:4000`)
   - **Fix:** Edit [mobile-app/utils/api.ts](mobile-app/utils/api.ts) getApiBase() function
   - **Find your IP (Windows):** Run `ipconfig` and look for IPv4 Address

3. **Database Migration Not Run**
   - **Check:** Log in to Supabase → SQL Editor → Run: `SELECT username FROM company_users WHERE username IS NOT NULL LIMIT 1;`
   - **Expected:** Should return at least one row with username
   - **Fix:** Run the migration from [backend/sql/migrations/2026-02-28-company-users-username.sql](backend/sql/migrations/2026-02-28-company-users-username.sql)

4. **No Username Set for Employee**
   - **Check:** Did you set a username when creating the supervisor from web portal?
   - **Fix:** Edit the employee in web portal and add username in "Mobile App Access" section

5. **View Console Logs to Debug**
   - **Run:** `cd mobile-app && npx expo start`
   - **Press:** `j` to open developer menu on device/emulator
   - **Look for:** Console logs showing "Attempting login", "Login successful", or error messages
   - **Common error messages:**
     - `"Network error"` = Backend not reachable (check API_BASE)
     - `"Invalid username or password"` = Wrong credentials or user doesn't exist
     - `"No password set"` = Employee created without password
     - `"Account is inactive"` = Employee status is not "Active"

### "Cannot find module '@react-native-async-storage/async-storage'"
- Solution: Run `npm install` in the mobile-app directory
- If issue persists: `npx expo install @react-native-async-storage/async-storage`

### "Login Failed - Network Error"
- Check `API_BASE` constant in `utils/api.ts`
- Ensure backend server is running
- For Android emulator, use `http://10.0.2.2:4000` not `http://localhost:4000`
- For physical device, ensure device and backend are on same network

### "Invalid credentials" error
- Verify employee exists in database with username and password
- Check that employee status is "Active"
- Ensure password was set when creating employee in portal

### Token expired or invalid
- Clear app data or reinstall app
- Or manually clear AsyncStorage: Add a logout button

## API Reference

### Login Request
```javascript
const response = await loginEmployee('ahmad.hassan', 'Test1234');
// Returns: { token: string, user: {...} }
```

### Verify Token
```javascript
const result = await verifyToken();
// Returns: { user: {...} } or null if invalid
```

### Logout
```javascript
await clearAuth();
router.replace('/');
```

## Notes

- Username is required for all new employees
- Existing employees without usernames cannot log in to mobile app
- Admins can add usernames to existing employees via the edit form
- JWT token is stored in AsyncStorage with key `@auth_token`
- User data is stored with key `@user_data`
