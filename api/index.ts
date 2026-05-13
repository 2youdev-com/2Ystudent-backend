import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let cachedApp: any = null;

async function getApp() {
  if (cachedApp) return cachedApp;

  await import('../src/container');
  const { app } = await import('../src/app');
  cachedApp = app;
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
    return app(req as unknown as Request, res as unknown as Response);
  } catch (err: any) {
    console.error('[Vercel Handler] Bootstrap failed:', err);
    res.status(500).json({
      error: 'Bootstrap failed',
      message: err?.message ?? 'Unknown error',
    });
  }
}
