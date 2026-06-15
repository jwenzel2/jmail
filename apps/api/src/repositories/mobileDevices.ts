import type { DeviceRegistration } from '@jmail/shared';
import { pool } from '../db.js';

export async function registerDevice(userId: string, device: DeviceRegistration): Promise<void> {
  await pool.query(
    `insert into mobile_devices
      (user_id, installation_id, fcm_token, device_name, notifications_enabled)
     values ($1,$2,$3,$4,$5)
     on conflict (user_id, installation_id) do update set
       fcm_token=excluded.fcm_token, device_name=excluded.device_name,
       notifications_enabled=excluded.notifications_enabled, updated_at=now()`,
    [
      userId,
      device.installationId,
      device.fcmToken,
      device.deviceName,
      device.notificationsEnabled,
    ],
  );
}

export async function unregisterDevice(userId: string, installationId: string): Promise<void> {
  await pool.query('delete from mobile_devices where user_id=$1 and installation_id=$2', [
    userId,
    installationId,
  ]);
}
