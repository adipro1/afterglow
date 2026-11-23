import { z } from 'zod';

export const WindowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(640),
  height: z.number().int().min(400),
  maximized: z.boolean().default(false),
});
export type WindowBounds = z.infer<typeof WindowBoundsSchema>;

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  window: WindowBoundsSchema.optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const defaultSettings: Settings = { version: 1 };
