import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { log } from '../log.js';
import { dbAvailable, query } from '../db/pool.js';

let pushReady = false;
let mailer: nodemailer.Transporter | undefined;

export function initNotifications(): void {
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
    pushReady = true;
    log.info('web push enabled');
  } else {
    log.info('web push disabled (set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY; generate with `npx web-push generate-vapid-keys`)');
  }
  if (config.SMTP_URL) {
    mailer = nodemailer.createTransport(config.SMTP_URL);
    log.info('email notifications enabled');
  }
}

export const notificationsStatus = () => ({ push: pushReady, email: !!mailer, vapidPublicKey: config.VAPID_PUBLIC_KEY });

export interface Notification { title: string; body: string; url?: string; tag?: string }

export async function sendPush(userId: string, n: Notification): Promise<number> {
  if (!pushReady || !dbAvailable()) return 0;
  const subs = await query<{ id: string; endpoint: string; keys: { p256dh: string; auth: string } }>('SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1', [userId]);
  let sent = 0;
  for (const s of subs.rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag }), { TTL: 600 });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      else log.warn({ err: (err as Error).message }, 'push failed');
    }
  }
  return sent;
}

export async function sendEmail(to: string, n: Notification): Promise<boolean> {
  if (!mailer) return false;
  try {
    await mailer.sendMail({ from: config.SMTP_FROM, to, subject: n.title, text: `${n.body}\n\n${n.url ?? ''}`.trim(), html: `<p>${n.body}</p>${n.url ? `<p><a href="${n.url}">Open in Contrail</a></p>` : ''}` });
    return true;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'email failed');
    return false;
  }
}
