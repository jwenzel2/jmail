# secrets/

Local-only credentials. **Nothing in this directory is committed** except this
README and `.gitkeep` (see the repo `.gitignore`).

## Firebase Cloud Messaging service account

The API sends mobile push notifications via the FCM HTTP v1 API, which
authenticates with a Google service-account key.

1. Firebase Console → your project → **Project settings → Service accounts**.
2. **Generate new private key** → download the JSON.
3. Save it here as:

   ```
   secrets/fcm-service-account.json
   ```

4. In your root `.env`, set:

   ```
   FCM_PROJECT_ID=your-firebase-project-id
   # Optional — defaults to ./secrets/fcm-service-account.json
   FCM_SERVICE_ACCOUNT_FILE=./secrets/fcm-service-account.json
   ```

If `FCM_PROJECT_ID` is omitted, the `project_id` from the service-account JSON
is used. When neither the project id nor a readable key file is present, push is
simply disabled (the API runs normally without it).

Never commit `fcm-service-account.json` — it grants send access to your Firebase
project.
