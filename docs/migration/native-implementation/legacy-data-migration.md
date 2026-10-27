# Existing data: offline transfer

Do not delete the old application profile. No user data has been read or converted
by the implementation work. Native stores use a separate migration-era directory.

1. Open the installed old application while its data remains available. Open its
   developer console and run the contents of `scripts/native/export-legacy-browser.js`.
   It exports whitelisted settings/history and referenced IndexedDB images into
   a checksummed JSON download. Review the script first. It excludes credentials.
2. Keep that original export. Run
   `node scripts/native/convert-legacy.mjs INPUT.json OUTPUT.json` from the checkout.
   The output path must not already exist. The converter rejects missing image
   content and unsupported provider identities instead of silently dropping them.
3. Open native Settings → Data → Import. Review counts, optionally select compatible
   preferences, then confirm. Existing IDs are not overwritten.
4. Re-enter cloud keys through native provider settings. Regenerate/pair extension
   tokens explicitly. Autostart, filesystem grants and helper authorizations are
   not imported as implicit permission grants.

The conversion output retains the original export in `legacyArchive` in addition
to mapped records. Keep the output as well as the original; native backup exports
contain native state and do not re-emit this opaque legacy envelope. Aggregate old
cost estimates without reconstructible message tokens remain legacy metadata.
Workspace and meeting imports commit separately; retries deduplicate IDs. Export
native state before bulk trimming. Attachment recovery directories are not purged
by the application.
