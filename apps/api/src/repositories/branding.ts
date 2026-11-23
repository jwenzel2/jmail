import {
  type Branding,
  type BrandingUpdate,
  brandingSchema,
  DEFAULT_BRANDING,
} from '@jmail/shared';
import { pool, upsertClause } from '../db.js';

/**
 * The app_settings table holds a single row (id = 1). Returns defaults if the
 * row is missing so the app is usable before any admin customization.
 */
export async function getBranding(): Promise<Branding> {
  const { rows } = await pool.query(
    `select app_name as "appName",
            logo_url as "logoUrl",
            primary_color as "primaryColor",
            login_message as "loginMessage"
       from app_settings
      where id = 1`,
  );
  const row = rows[0];
  if (!row) return DEFAULT_BRANDING;
  return brandingSchema.parse(row);
}

export async function updateBranding(patch: BrandingUpdate): Promise<Branding> {
  const current = await getBranding();
  const next = brandingSchema.parse({ ...current, ...patch });
  await pool.query(
    `insert into app_settings (id, app_name, logo_url, primary_color, login_message, updated_at)
     values (1, $1, $2, $3, $4, now())
     ${upsertClause(['id'], ['app_name', 'logo_url', 'primary_color', 'login_message'])}`,
    [next.appName, next.logoUrl, next.primaryColor, next.loginMessage],
  );
  return next;
}
