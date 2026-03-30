#!/usr/bin/env python3
"""
Upload an Android App Bundle (.aab) to Google Play Store.

Uses Application Default Credentials (ADC) — fully compatible with
Workload Identity Federation. No JSON key file is required in production.

Environment variables:
  GOOGLE_APPLICATION_CREDENTIALS  Set automatically by google-github-actions/auth WIF step
  AAB_PATH        Path to the .aab file to upload
  PACKAGE_NAME    Android package name (e.g. com.cct123.mobileapp)
  PLAY_TRACK      Target track: internal | alpha | beta | production  (default: internal)
  RELEASE_STATUS  Release status: draft | completed | halted          (default: draft)
"""

import os
import sys

import google.auth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload


def main() -> None:
    package_name   = os.environ["PACKAGE_NAME"]
    aab_path       = os.environ["AAB_PATH"]
    track          = os.environ.get("PLAY_TRACK", "internal")
    release_status = os.environ.get("RELEASE_STATUS", "draft")

    # ── Validate input ───────────────────────────────────────────────────────
    if not os.path.isfile(aab_path):
        print(f"ERROR: AAB file not found at '{aab_path}'", file=sys.stderr)
        sys.exit(1)

    aab_size_mb = os.path.getsize(aab_path) / (1024 * 1024)
    print("=" * 60)
    print(f"  Package : {package_name}")
    print(f"  Track   : {track}")
    print(f"  Status  : {release_status}")
    print(f"  File    : {aab_path}  ({aab_size_mb:.1f} MB)")
    print("=" * 60)

    # ── Authenticate using ADC (short-lived WIF token in CI, user creds locally) ──
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    service = build("androidpublisher", "v3", credentials=credentials)

    # ── Open a new edit session ──────────────────────────────────────────────
    print("\n[1/4] Opening edit session...")
    try:
        edit = service.edits().insert(packageName=package_name, body={}).execute()
    except HttpError as e:
        print(f"ERROR opening edit: {e}", file=sys.stderr)
        print("  • Verify the service account has 'Release Manager' or 'Admin' role in Play Console.", file=sys.stderr)
        print("  • Verify the app package exists in Play Console.", file=sys.stderr)
        sys.exit(1)

    edit_id = edit["id"]
    print(f"     Edit ID: {edit_id}")

    # ── Upload the AAB ───────────────────────────────────────────────────────
    print("\n[2/4] Uploading AAB (resumable)...")
    media = MediaFileUpload(
        aab_path,
        mimetype="application/octet-stream",
        resumable=True,
        chunksize=10 * 1024 * 1024,  # 10 MB chunks
    )
    try:
        bundle = (
            service.edits()
            .bundles()
            .upload(packageName=package_name, editId=edit_id, media_body=media)
            .execute()
        )
    except HttpError as e:
        print(f"ERROR uploading AAB: {e}", file=sys.stderr)
        sys.exit(1)

    version_code = bundle["versionCode"]
    print(f"     Uploaded versionCode: {version_code}")

    # ── Assign to the target track ───────────────────────────────────────────
    print(f"\n[3/4] Assigning versionCode {version_code} to '{track}' track as '{release_status}'...")
    try:
        service.edits().tracks().update(
            packageName=package_name,
            editId=edit_id,
            track=track,
            body={
                "releases": [
                    {
                        "versionCodes": [version_code],
                        "status": release_status,
                    }
                ]
            },
        ).execute()
    except HttpError as e:
        print(f"ERROR updating track: {e}", file=sys.stderr)
        sys.exit(1)

    # ── Commit the edit ──────────────────────────────────────────────────────
    print("\n[4/4] Committing edit...")
    try:
        service.edits().commit(packageName=package_name, editId=edit_id).execute()
    except HttpError as e:
        print(f"ERROR committing edit: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n✅  Success!")
    print(f"   versionCode {version_code} is now on the '{track}' track ({release_status}).")
    print("   Open Play Console to review and promote the release:")
    print("   https://play.google.com/console/developers")


if __name__ == "__main__":
    main()
