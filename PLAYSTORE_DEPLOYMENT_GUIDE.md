# Google Play Store Deployment Guide

## Overview
This document explains how to deploy the FM mobile app to Google Play Store using the automated GitHub Actions workflow.

---

## Part 1: One-time Google Cloud Setup (Keyless – No JSON Key)

This deployment uses **Workload Identity Federation (WIF)**.
GitHub Actions gets a short-lived OIDC token from GitHub, exchanges it for a
short-lived Google token, and uploads to Play Store — no key file is ever
downloaded, stored, or shared.

---

### Step 1.1: Create a Google Cloud Project
1. Go to: **https://console.cloud.google.com/**
2. Click the project dropdown (top left) → **"NEW PROJECT"**
3. Name it: `fm-mobile-app`
4. Click **"CREATE"** and wait ~2 minutes
5. Note your **Project ID** (e.g. `fm-mobile-app-123456`) and **Project Number**
   (find it under Home → Project info panel)

### Step 1.2: Enable the Android Publisher API
1. In the sidebar go to **"APIs & Services" → "Enable APIs and Services"**
2. Search for **"Google Play Android Developer API"**
3. Click it → **"ENABLE"**

### Step 1.3: Create a Service Account (identity only, no key)
1. Go to **"IAM & Admin" → "Service Accounts"**
2. Click **"+ CREATE SERVICE ACCOUNT"**
3. Fill in:
   - **Name:** `play-uploader`
   - **ID:** auto-filled → note the generated email (you'll need it later)
   - **Description:** `Keyless Play Store uploader for FM app CI`
4. Click **"CREATE AND CONTINUE"**
5. Add role: **"Editor"** → click **"CONTINUE"** → **"DONE"**
6. **Do NOT create a key.** The whole point of WIF is that no key is needed.

### Step 1.4: Create a Workload Identity Pool
1. Go to **"IAM & Admin" → "Workload Identity Federation"**
2. Click **"CREATE POOL"**
3. Fill in:
   - **Name:** `github-actions`
   - **Pool ID:** `github-actions`
   - **Description:** `GitHub Actions OIDC pool`
4. Click **"CONTINUE"**

### Step 1.5: Add a GitHub Actions Provider to the Pool
On the "Add a provider" screen:
1. **Provider type:** `OpenID Connect (OIDC)`
2. **Provider name:** `github`
3. **Provider ID:** `github`
4. **Issuer URL:** `https://token.actions.githubusercontent.com`
5. Click **"CONTINUE"**
6. Under **"Attribute mapping"** add:
   | Google attribute | OIDC attribute |
   |---|---|
   | `google.subject` | `assertion.sub` |
   | `attribute.repository` | `assertion.repository` |
7. Under **"Attribute conditions"** enter:
   ```
   attribute.repository == "CCT3060/FM_Repo"
   ```
   *(This restricts access to your repo only)*
8. Click **"SAVE"**

### Step 1.6: Grant the Service Account Access to the Pool
1. Open the pool you just created
2. Click **"GRANT ACCESS"**
3. Select your service account: `play-uploader@fm-mobile-app-XXXXXX.iam.gserviceaccount.com`
4. Under **"Select principals"**: choose **"All identities in pool"**
5. Click **"SAVE"**

### Step 1.7: Note your WIF Provider resource name
From the pool details page, note the full provider path:
```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github
```
Replace `PROJECT_NUMBER` with your actual 12-digit project number.

### Step 1.8: Link the Service Account to Play Console
1. Go to: **https://play.google.com/console/**
2. **Settings → Users and Permissions → Invite new users**
3. Enter the service account email: `play-uploader@fm-mobile-app-XXXXXX.iam.gserviceaccount.com`
4. Grant permission: **"Admin"** (or at minimum **"Release Manager"**)
5. Click **"Invite user"**

---

## Part 2: Add GitHub Secrets (3 secrets total)
 
Go to: **https://github.com/CCT3060/FM_Repo/settings/secrets/actions**
Click **"New repository secret"** for each:

| Secret name | Value |
|---|---|
| `EXPO_TOKEN` | Expo access token (instructions below) |
| `WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github` |
| `WIF_SERVICE_ACCOUNT` | `play-uploader@fm-mobile-app-XXXXXX.iam.gserviceaccount.com` |

### Get your Expo Token
1. Go to: **https://expo.dev/accounts/moghekarparikshit/settings/access-tokens**
2. Click **"Create Token"**
3. Name: `GitHub Actions Deploy`
4. Expiration: `1 year`
5. Click **"Create"** → copy the token immediately

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

## Part 6: How Keyless Auth Works (No JSON Key Needed)

With Workload Identity Federation, no `google-play-service-account.json` file is
created or downloaded. Here is what happens instead:

```
GitHub Actions run starts
        │
        ▼
GitHub issues a short-lived OIDC token
(proves: "this is repo CCT3060/FM_Repo, branch develop, run #XYZ")
        │
        ▼
google-github-actions/auth exchanges it with Google's STS service
(Google verifies the token matches your WIF pool+provider conditions)
        │
        ▼
Google issues a short-lived access token (~1 hour expiry)
Saved to a temp file → GOOGLE_APPLICATION_CREDENTIALS env var
        │
        ▼
upload_play.py reads ADC credentials transparently
Uploads AAB via Play Developer API using the short-lived token
        │
        ▼
Token expires automatically — nothing to revoke or rotate
```

**Key benefits over JSON key:**
- No secret to rotate or accidentally leak
- Token is bound to exactly this repo and expires in ~1 hour
- Audit logs in Google Cloud show every CI upload clearly
- Follows Google's recommended best practice for automation

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

### Google Cloud (one-time)
- [ ] Created Google Cloud project `fm-mobile-app`
- [ ] Enabled Google Play Android Developer API
- [ ] Created service account `play-uploader` (no key downloaded)
- [ ] Created Workload Identity Pool `github-actions`
- [ ] Added GitHub OIDC provider to the pool with repo condition
- [ ] Granted service account access to the WIF pool
- [ ] Added service account email to Play Console with "Admin" role

### GitHub Secrets (3 total)
- [ ] `EXPO_TOKEN` added
- [ ] `WIF_PROVIDER` added (full `projects/.../providers/github` path)
- [ ] `WIF_SERVICE_ACCOUNT` added (service account email)

### First Deploy
- [ ] Triggered first build via GitHub Actions
- [ ] Build completed on EAS Dashboard
- [ ] AAB uploaded to Play Console (internal track, draft)
- [ ] Completed store listing in Play Console (description, screenshots, rating)
- [ ] Published to Play Store

---

## Need Help?

- **Expo EAS Documentation:** https://docs.expo.dev/eas/
- **Google Play Console Help:** https://support.google.com/googleplay/android-developer/
- **Service Account Setup:** https://support.google.com/googleplay/android-developer/answer/6277310

