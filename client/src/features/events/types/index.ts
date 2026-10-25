import { z } from 'zod';

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, { message: 'Title must be at least 3 characters long' })
      .max(255, { message: 'Title is too long' }),
    description: z
      .string()
      .max(5000, { message: 'Description is too long' }),
    date: z.string().min(1, { message: 'Pick a date and time' }),
    location: z
      .string()
      .trim()
      .min(2, { message: 'Location is required' })
      .max(255, { message: 'Location is too long' }),
    capacity: z
      .string()
      .regex(/^\d+$/, { message: 'Enter a whole number' })
      .refine((v) => Number(v) >= 1, { message: 'Capacity must be at least 1' }),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/, {
      message: 'Enter an amount like 15 or 15.50 (0 for a free event)',
    }),
  })
  .refine((d) => !Number.isNaN(new Date(d.date).getTime()), {
    message: 'Pick a valid date and time',
    path: ['date'],
  });

export type EventFormData = z.infer<typeof eventFormSchema>;
