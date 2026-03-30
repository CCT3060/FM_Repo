# Google Play Store Deployment Guide

## Overview
This document explains how to deploy the FM mobile app to Google Play Store using the automated GitHub Actions workflow.

---

## Part 1: Create Google Service Account Key

### Step 1.1: Open Google Cloud Console
1. Go to: **https://console.cloud.google.com/**
2. Sign in with your Google account (systemuser580@gmail.com in your case)
3. If you have multiple organizations, select the one linked to your Play Store

### Step 1.2: Create a Project (if not exists)
1. On the top left, click the dropdown next to "Google Cloud"
2. Click **"NEW PROJECT"**
3. Name it: `FM-Mobile-App`
4. Click **"CREATE"**
5. Wait for the project to be created (2-3 minutes)
6. Click the notification to open the new project

### Step 1.3: Create a Service Account
1. In the left sidebar, go to **"APIs & Services"**
2. Click **"Credentials"**
3. Click **"+ CREATE CREDENTIALS"**
4. Select **"Service Account"**
5. Fill in:
   - **Service account name:** `play-store-uploader`
   - **Service account ID:** auto-filled (keep default)
   - **Description:** `Service account for publishing FM app to Play Store`
6. Click **"CREATE AND CONTINUE"**

### Step 1.4: Grant IAM Roles
On the "Grant this service account access to project" screen:
1. Under **"Select a role"**, search for and select:
   - **"Editor"** (or find **"Play Console Developer"** if available)
2. Click **"CONTINUE"**

### Step 1.5: Create JSON Key File
1. Click **"+ CREATE KEY"**
2. Select **"JSON"**
3. A JSON file will automatically download to your computer
4. This is your **google-play-service-account.json** file

### Step 1.6: Link Service Account to Play Console
1. Go to **https://play.google.com/console/**
2. Select your app (or create one if needed)
3. Go to **Settings → User and Permissions**
4. Click **"ADD USER"**
5. Paste the service account email (found in the JSON file as `"client_email": "..."`)
6. Grant role: **"Admin"**
7. Click **"INVITE USER"**

---

## Part 2: Add Credentials to GitHub Secrets

### Step 2.1: Get Expo Token
1. Go to: **https://expo.dev/accounts/moghekarparikshit/settings/access-tokens**
2. Click **"Create Token"**
3. Name: `GitHub Actions Deploy`
4. Expiration: `1 year`
5. Click **"Create"**
6. Copy the token (you won't see it again)

### Step 2.2: Prepare Service Account JSON Content
1. Open the `google-play-service-account.json` file you downloaded
2. Copy the entire JSON content (not the file path)
3. Example structure:
   ```json
   {
     "type": "service_account",
     "project_id": "fm-mobile-app-123456",
     "private_key_id": "abc123...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "play-store-uploader@fm-mobile-app-123456.iam.gserviceaccount.com",
     "client_id": "123456789",
     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
     "token_uri": "https://oauth2.googleapis.com/token",
     "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
     "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
   }
   ```

### Step 2.3: Add Secrets to GitHub
1. Go to: **https://github.com/CCT3060/FM_Repo/settings/secrets/actions**
2. Click **"New repository secret"**
3. Add two secrets:

   **Secret 1: EXPO_TOKEN**
   - Name: `EXPO_TOKEN`
   - Value: (paste your Expo token from Step 2.1)
   - Click **"Add secret"**

   **Secret 2: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON**
   - Name: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
   - Value: (paste the entire JSON from Step 2.2)
   - Click **"Add secret"**

---

## Part 3: Deploy to Play Store

### Option A: Automatic Deployment (Recommended)
The app will automatically build and deploy when you push changes to `develop`:

1. Make a change to `mobile-app/` folder
2. Commit and push to `develop`
3. Go to: **https://github.com/CCT3060/FM_Repo/actions**
4. Find **"Android Play Store Release"** workflow
5. Wait for build to complete (15-25 minutes)
6. Check Play Console for the submitted build

### Option B: Manual Deployment
1. Go to: **https://github.com/CCT3060/FM_Repo/actions**
2. Click **"Android Play Store Release"** on the left
3. Click **"Run workflow"**
4. Select branch: `develop`
5. Click **"Run workflow"**
6. Wait for build and submission to complete

### Option C: Command Line (Local)
If you want to deploy from your machine:

```bash
cd mobile-app

# Set environment variables
$env:EXPO_TOKEN = "your-expo-token"

# Build for production
npx eas build --platform android --profile production

# Submit to Play Store
npx eas submit --platform android --profile production --latest
```

---

## Part 4: Monitor Build Progress

### During Build:
1. Go to: **https://expo.dev/accounts/moghekarparikshit/projects/fmapp/builds**
2. You'll see the build status in real-time

### After Submission:
1. Go to: **https://play.google.com/console/**
2. Select your app
3. Go to **"Release" → "Production" or "Internal testing"** (depending on track)
4. You should see your build submitted as "Draft"

---

## Part 5: Review & Publish

### Step 5.1: Review Build
1. In Play Console, go to your app
2. Go to **"Release" → "Production"** (or "Internal testing")
3. Click on your submitted build
4. Review app information:
   - App title
   - Description
   - Screenshots
   - Icon
   - Version code (auto-incremented)

### Step 5.2: Complete Store Listing
1. Go to **"Store listing"**
2. Fill in:
   - **Short description** (80 chars max)
   - **Full description** (4000 chars max)
   - **App category**
   - **Content rating**
3. Click **"Save"**

### Step 5.3: Add Content Rating
1. Go to **"Content rating"**
2. Fill out questionnaire
3. Submit for rating (usually approved instantly)

### Step 5.4: Set Pricing & Distribution
1. Go to **"Pricing & distribution"**
2. Select countries/regions
3. Set pricing (free or paid)
4. Click **"Save"**

### Step 5.5: Publish
1. Go back to **"Release" → "Production"**
2. Click **"Review release"**
3. Verify app details
4. Click **"Publish release"**
5. App will go live within 2-24 hours

---

## Part 6: Find Service Account File Path

The service account JSON file path from the error message:
```
Path to Google Service Account file: ... api-0000000000000000000-111111-aaaaaabbbbbb.json
```

### Where to Find It:

**Inside the JSON file itself:**
1. Open the downloaded `google-play-service-account.json`
2. Look for the field: `"client_x509_cert_url"`
3. The URL contains your service account email pattern
4. Example:
   ```
   https://www.googleapis.com/robot/v1/metadata/x509/play-store-uploader%40fm-mobile-app-123456.iam.gserviceaccount.com
   ```

**Breakdown of filename pattern:**
```
api-0000000000000000000-111111-aaaaaabbbbbb.json
  └─────────────┬──────────────┬─────────────┘
        project_id    ????       random_id
```

- **project_id**: Found in JSON as `"project_id"`
- The suffix is auto-generated by Google

---

## Troubleshooting

### Issue: "File not found" error in GitHub Actions
**Solution:** Ensure the secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is properly added and contains the full JSON content.

### Issue: "Invalid service account" error
**Solution:** 
1. Verify the service account email is added to Play Console with "Admin" role
2. Re-download the JSON key and update the GitHub secret

### Issue: Build takes too long
**Solution:** Free tier EAS builds are slower. Consider upgrading to a paid EAS plan for faster builds.

### Issue: App rejected on Play Store
**Solution:** 
1. Check Play Console for rejection reason
2. Review Play Store policies: https://play.google.com/about/gpp/
3. Fix the issue and re-submit

---

## Current Configuration

Your app is configured with:
- **App ID (Bundle):** `com.cct123.mobileapp`
- **App Name:** `mobile-app` (slug: `fmapp`)
- **Version:** `1.0.0`
- **Track:** `internal` (for testing before production)
- **Release Status:** `draft`

**To change track to "production":**
Edit `mobile-app/eas.json`:
```json
"submit": {
  "production": {
    "android": {
      "track": "production"  // Change from "internal"
    }
  }
}
```

---

## Summary Checklist

- [ ] Created Google Cloud Project
- [ ] Created Service Account in Google Cloud Console
- [ ] Downloaded google-play-service-account.json
- [ ] Added service account email to Play Console with Admin role
- [ ] Generated Expo token from expo.dev
- [ ] Added EXPO_TOKEN secret to GitHub
- [ ] Added GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret to GitHub
- [ ] Triggered first build via GitHub Actions
- [ ] Monitored build in EAS Dashboard
- [ ] Reviewed and completed store listing in Play Console
- [ ] Published app to Play Store

---

## Need Help?

- **Expo EAS Documentation:** https://docs.expo.dev/eas/
- **Google Play Console Help:** https://support.google.com/googleplay/android-developer/
- **Service Account Setup:** https://support.google.com/googleplay/android-developer/answer/6277310

