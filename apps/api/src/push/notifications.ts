import {
  deleteDeviceByToken,
  listEnabledDevicesForUser,
} from '../repositories/mobileDevices.js';
import { isPushConfigured, sendDataMessage } from './fcm.js';

export interface NewMailPush {
  sender?: string;
  subject?: string;
  preview?: string;
  messageId?: string;
}

/**
 * Sends a new-mail push to every notification-enabled device of a user.
 * Best-effort: failures are swallowed, and tokens FCM reports as unregistered
 * are pruned from the database. A no-op when push is not configured.
 */
export async function notifyNewMail(userId: string, payload: NewMailPush): Promise<void> {
  if (!isPushConfigured()) return;

  const devices = await listEnabledDevicesForUser(userId);
  if (devices.length === 0) return;

  const data: Record<string, string> = {};
  if (payload.sender) data.sender = payload.sender;
  if (payload.subject) data.subject = payload.subject;
  if (payload.preview) data.preview = payload.preview;
  if (payload.messageId) data.messageId = payload.messageId;

  await Promise.all(
    devices.map(async (device) => {
      const result = await sendDataMessage(device.fcmToken, data).catch(() => ({
        ok: false,
        unregistered: false,
      }));
      if (result.unregistered) {
        await deleteDeviceByToken(device.fcmToken).catch(() => undefined);
      }
    }),
  );
}
