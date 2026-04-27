import { z } from 'zod';

export const leadStatusValues = ['New', 'In Progress', 'Booked', 'Aged', 'DQ'] as const;
export const attendanceStatusValues = ['Pending', 'Yes', 'No'] as const;
export const activityTypeValues = ['call', 'sms', 'email'] as const;
export const makeEventTypeValues = [
  'new_lead',
  'lead_source_update',
  'speed_to_lead',
  'all_dial',
  'appointment_booked',
  'appointment_cancelled',
  'appointment_rescheduled',
  'showed',
  'no_show',
  'disqualified',
  'aged_lead',
  'dnd',
  'in_conversation',
  'off_shift_appointment_request',
  'virtual_quote',
  'recording_summary',
  'daily_summary_agent_stats',
  'daily_summary_project_stats',
  'daily_summary_project_source',
  'reporting_alert'
] as const;
export const googleSheetActionValues = ['addRow', 'updateRow', 'filterRows'] as const;

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Expected a valid MongoDB ObjectId.');

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  }, schema.optional());

const emptyStringToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return null;
    }
    return value;
  }, schema.nullable().optional());

export const leadIngestSchema = z.object({
  ghl_sub_account_id: z.string().trim().min(1),
  company_name: z.string().trim().min(1),
  phone_number: z.string().trim().min(5),
  full_name: emptyStringToUndefined(z.string().trim().min(1)),
  email: emptyStringToUndefined(z.string().trim().email()),
  service_requested: emptyStringToUndefined(z.string().trim().min(1)),
  location: emptyStringToUndefined(z.string().trim().min(1)),
  assigned_setter: emptyStringToUndefined(z.string().trim().min(1)),
  status: z.enum(leadStatusValues).optional(),
  dq_reason: emptyStringToUndefined(z.string().trim().min(1)),
  created_at: z.coerce.date().optional()
});

export const leadActivitySchema = z.object({
  lead_id: objectIdSchema,
  type: z.enum(activityTypeValues)
});

export const leadStatusUpdateSchema = z
  .object({
    lead_id: objectIdSchema,
    status: z.enum(leadStatusValues).optional(),
    dq_reason: emptyStringToNull(z.string().trim().min(1)),
    showed_up: z.enum(attendanceStatusValues).optional(),
    appointment_date: emptyStringToNull(z.coerce.date())
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.dq_reason !== undefined ||
      value.showed_up !== undefined ||
      value.appointment_date !== undefined,
    {
      message: 'At least one lead or metric field must be provided for update.'
    }
  );

const nonNegativeIntegerSchema = z.coerce.number().int().min(0);
const positiveIntegerSchema = z.coerce.number().int().min(1);

const makeLeadEventTypes = new Set<string>([
  'new_lead',
  'lead_source_update',
  'speed_to_lead',
  'all_dial',
  'appointment_booked',
  'appointment_cancelled',
  'appointment_rescheduled',
  'showed',
  'no_show',
  'disqualified',
  'aged_lead',
  'dnd',
  'in_conversation',
  'off_shift_appointment_request',
  'virtual_quote',
  'recording_summary'
]);

export const makeReportingEventSchema = z
  .object({
    scenario_name: z.string().trim().min(1),
    event_type: z.enum(makeEventTypeValues),
    sheet_name: emptyStringToUndefined(z.string().trim().min(1)),
    google_sheet_action: z.enum(googleSheetActionValues).optional(),
    lead_id: emptyStringToUndefined(objectIdSchema),
    ghl_sub_account_id: emptyStringToUndefined(z.string().trim().min(1)),
    company_name: emptyStringToUndefined(z.string().trim().min(1)),
    phone_number: emptyStringToUndefined(z.string().trim().min(5)),
    full_name: emptyStringToUndefined(z.string().trim().min(1)),
    email: emptyStringToUndefined(z.string().trim().email()),
    service_requested: emptyStringToUndefined(z.string().trim().min(1)),
    location: emptyStringToUndefined(z.string().trim().min(1)),
    assigned_setter: emptyStringToUndefined(z.string().trim().min(1)),
    lead_source: emptyStringToUndefined(z.string().trim().min(1)),
    status: z.enum(leadStatusValues).optional(),
    dq_reason: emptyStringToNull(z.string().trim().min(1)),
    showed_up: z.enum(attendanceStatusValues).optional(),
    appointment_date: emptyStringToNull(z.coerce.date()),
    created_at: z.coerce.date().optional(),
    occurred_at: z.coerce.date().optional(),
    first_contact_at: emptyStringToNull(z.coerce.date()),
    speed_to_lead_min: z.coerce.number().min(0).nullable().optional(),
    activity_type: z.enum(activityTypeValues).optional(),
    activity_count: positiveIntegerSchema.optional(),
    call_count_delta: nonNegativeIntegerSchema.optional(),
    sms_count_delta: nonNegativeIntegerSchema.optional(),
    email_count_delta: nonNegativeIntegerSchema.optional(),
    recording_url: emptyStringToNull(z.string().trim().url()),
    call_summary: emptyStringToNull(z.string().trim().min(1)),
    row_number: nonNegativeIntegerSchema.optional(),
    raw: z.record(z.any()).optional()
  })
  .refine((value) => {
    if (!makeLeadEventTypes.has(value.event_type)) {
      return true;
    }

    if (value.lead_id) {
      return true;
    }

    if (!value.phone_number) {
      return false;
    }

    return Boolean(value.ghl_sub_account_id || value.company_name);
  }, {
    message:
      'Lead-level Make events require lead_id, or phone_number plus ghl_sub_account_id/company_name.'
  });

export type LeadStatusInput = (typeof leadStatusValues)[number];
export type AttendanceStatusInput = (typeof attendanceStatusValues)[number];
export type ActivityTypeInput = (typeof activityTypeValues)[number];
export type MakeEventTypeInput = (typeof makeEventTypeValues)[number];
