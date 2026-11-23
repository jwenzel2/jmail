import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

// Opt in with a migrated test database. Every invocation owns its user and
// removes that user's data (including sessions and contacts) via foreign keys.
it.skipIf(process.env.JMAIL_DB_TEST !== '1')(
  'preserves repository contracts on the configured engine',
  async () => {
    const { pool, closePool } = await import('../db.js');
    const { upsertUser } = await import('./users.js');
    const { createContact, listContacts, updateContact } = await import('./contacts.js');
    const { createSession, getSessionUser } = await import('./sessions.js');
    const { createMobileAuthCode, consumeMobileAuthCode } = await import('./mobileAuth.js');
    const { upsertImportedEvent } = await import('./calendar.js');
    const sub = randomUUID();
    const email = sub + '@example.org';
    try {
      const user = await upsertUser({ sub, email, displayName: null, isAdmin: false });
      const sid = await createSession(user.id);
      expect(await getSessionUser(sid)).toEqual(user);
      const code = await createMobileAuthCode(user.id, sid);
      const consumed = await Promise.all([
        consumeMobileAuthCode(code),
        consumeMobileAuthCode(code),
      ]);
      expect(consumed.filter(Boolean)).toEqual([{ userId: user.id, sid }]);

      const contact = await createContact(user.id, {
        email,
        displayName: 'Example',
        favorite: false,
        notes: null,
        company: null,
        phone: null,
      });
      expect((await listContacts(user.id, 'AMP'))[0]?.favorite).toBe(false);
      expect((await updateContact(user.id, contact.id, { favorite: true }))?.favorite).toBe(true);

      const event = {
        icalUid: sub,
        recurrence: null,
        title: 'Initial',
        startsAt: '2030-06-01T11:01:00.123Z',
        endsAt: '2030-06-01T12:01:00.123Z',
        allDay: false,
        description: null,
        location: null,
      };
      const first = await upsertImportedEvent(user.id, event);
      expect(await upsertImportedEvent(user.id, { ...event, title: 'Updated' })).toMatchObject({
        id: first.id,
        startsAt: event.startsAt,
        title: 'Updated',
        allDay: false,
      });
    } finally {
      try {
        await pool.query('delete from users where oidc_sub=$1', [sub]);
      } finally {
        await closePool();
      }
    }
  },
);
