import { z } from 'zod';

const taskIdRegex = /^[a-zA-Z0-9_-]+$/;

export const alertDraftSchema = z
  .object({
    name: z.string().trim().min(1, 'Alert name is required').max(120, 'Name too long'),
    description: z.string().max(300, 'Description too long').optional().or(z.literal('')),
    type: z.enum(['folder', 'list', 'custom']),
    teamId: z.string().trim().min(1, 'Team is required'),
    folderId: z.string().trim().optional(),
    folderName: z.string().trim().optional(),
    listId: z.string().trim().optional(),
    listName: z.string().trim().optional(),
    customScopeType: z.enum(['folder', 'list']).optional(),
    timeRangeMode: z.enum(['monthly', 'custom', 'none']),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    budgetHours: z.number().positive('Budget hours must be greater than 0'),
    warningThresholdPct: z
      .number()
      .min(0, 'Warning threshold must be >= 0')
      .max(1000, 'Warning threshold is too high'),
    criticalThresholdPct: z
      .number()
      .min(1, 'Critical threshold must be > 0')
      .max(1000, 'Critical threshold is too high'),
    excludedTaskIds: z.array(z.string().trim().regex(taskIdRegex, 'Invalid task ID format')),
    includeOnlyTaskIds: z
      .array(z.string().trim().regex(taskIdRegex, 'Invalid task ID format'))
      .optional(),
    refreshFrequencyMinutes: z.number().min(0).max(720),
    active: z.boolean()
  })
  .superRefine((val, ctx) => {
    if (val.type === 'folder' && !val.folderId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Folder is required', path: ['folderId'] });
    }

    if (val.type === 'list' && !val.listId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'List is required', path: ['listId'] });
    }

    if (val.type === 'custom') {
      if (!val.customScopeType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Custom scope type is required',
          path: ['customScopeType']
        });
      }
      if (val.customScopeType === 'folder' && !val.folderId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Folder is required', path: ['folderId'] });
      }
      if (val.customScopeType === 'list' && !val.listId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'List is required', path: ['listId'] });
      }
    }

    if (val.timeRangeMode === 'custom') {
      if (!val.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date required', path: ['startDate'] });
      }
      if (!val.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date required', path: ['endDate'] });
      }
      if (val.startDate && val.endDate && val.startDate > val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End date must be on or after start date',
          path: ['endDate']
        });
      }
    }

    if (val.warningThresholdPct >= val.criticalThresholdPct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Warning threshold must be lower than critical threshold',
        path: ['warningThresholdPct']
      });
    }
  });

export type AlertDraftInput = z.infer<typeof alertDraftSchema>;
