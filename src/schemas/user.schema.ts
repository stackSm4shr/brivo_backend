import { z } from "zod";

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50)
    .optional(),

  image: z
    .string()
    .url("Image must be a valid URL")
    .optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const profileSchema = z.object({
  bio: z
    .string()
    .max(500)
    .optional(),

  location: z
    .string()
    .max(100)
    .optional(),

  website: z
    .string()
    .url("Website must be a valid URL")
    .optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;