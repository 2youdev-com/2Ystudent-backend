import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import '../src/container.js';
import { app } from '../src/app.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return app(req as unknown as Request, res as unknown as Response);
  } catch (err: any) {
    console.error('[Vercel Handler] Request failed:', err);
    res.status(500).json({
      error: 'Request failed',
      message: err?.message ?? 'Unknown error',
    });
  }
}
