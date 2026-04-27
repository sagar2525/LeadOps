import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  AttendanceStatus,
  LeadDocument,
  LeadMetricDocument,
  LeadStatus,
  MakeReportingEventDocument,
  SubAccountDocument,
  getLeadMetricsCollection,
  getLeadsCollection,
  getMakeReportingEventsCollection,
  getSubAccountsCollection,
  requireDocument,
  serializeDocument,
  serializeNullableDocument,
  toObjectId
} from '../lib/mongo';
import {
  ActivityTypeInput,
  AttendanceStatusInput,
  LeadStatusInput,
  MakeEventTypeInput,
  makeReportingEventSchema
} from '../validators';

const leadStatusMap: Record<LeadStatusInput, LeadStatus> = {
  New: 'New',
  'In Progress': 'In Progress',
  Booked: 'Booked',
  Aged: 'Aged',
  DQ: 'DQ'
};

const attendanceStatusMap: Record<AttendanceStatusInput, AttendanceStatus> = {
  Pending: 'Pending',
  Yes: 'Yes',
  No: 'No'
};

const metricIncrementFieldMap: Record<
  ActivityTypeInput,
  'call_count' | 'sms_count' | 'email_count'
> = {
  call: 'call_count',
  sms: 'sms_count',
  email: 'email_count'
};

const leadLevelEventTypes = new Set<MakeEventTypeInput>([
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

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }

  return digits;
}

function calculateSpeedToLeadMin(createdAt: Date, firstContactAt: Date): number {
  const diffInMinutes = Math.max(
    0,
    (firstContactAt.getTime() - createdAt.getTime()) / 60000
  );

  return Number(diffInMinutes.toFixed(2));
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function fallbackSubAccountId(companyName?: string) {
  return companyName ? `company:${slugify(companyName)}` : null;
}

function defaultLeadStatusForEvent(eventType: MakeEventTypeInput): LeadStatus | undefined {
  switch (eventType) {
    case 'appointment_booked':
      return 'Booked';
    case 'disqualified':
      return 'DQ';
    case 'aged_lead':
      return 'Aged';
    case 'new_lead':
      return 'New';
    default:
      return undefined;
  }
}

async function ensureLeadMetric(leadId: LeadDocument['_id']) {
  const leadMetrics = await getLeadMetricsCollection();
  const now = new Date();

  await leadMetrics.updateOne(
    { lead_id: leadId },
    {
      $setOnInsert: {
        lead_id: leadId,
        call_count: 0,
        sms_count: 0,
        email_count: 0,
        showed_up: 'Pending',
        updated_at: now
      }
    },
    { upsert: true }
  );

  return requireDocument(leadMetrics, { lead_id: leadId }, 'Lead metric not found after upsert.');
}

async function hydrateLead(lead: LeadDocument) {
  const [subAccounts, leadMetrics] = await Promise.all([
    getSubAccountsCollection(),
    getLeadMetricsCollection()
  ]);

  const [subAccount, metrics] = await Promise.all([
    subAccounts.findOne({ _id: lead.sub_account_id }),
    leadMetrics.findOne({ lead_id: lead._id })
  ]);

  return {
    ...serializeDocument(lead),
    subAccount: serializeNullableDocument(subAccount),
    metrics: serializeNullableDocument(metrics)
  };
}

async function resolveSubAccount(args: {
  ghlSubAccountId?: string;
  companyName?: string;
  now: Date;
}) {
  const subAccounts = await getSubAccountsCollection();
  const ghlSubAccountId = args.ghlSubAccountId ?? fallbackSubAccountId(args.companyName);

  if (!ghlSubAccountId) {
    throw new Error('A sub-account identifier could not be derived for this Make event.');
  }

  await subAccounts.updateOne(
    { ghl_sub_account_id: ghlSubAccountId },
    {
      $set: {
        company_name: args.companyName ?? ghlSubAccountId,
        is_active: true,
        updated_at: args.now
      },
      $setOnInsert: {
        created_at: args.now
      }
    },
    { upsert: true }
  );

  return requireDocument(
    subAccounts,
    { ghl_sub_account_id: ghlSubAccountId },
    'Sub-account not found after upsert.'
  );
}

async function resolveLead(args: {
  leadId?: string;
  eventType: MakeEventTypeInput;
  ghlSubAccountId?: string;
  companyName?: string;
  phoneNumber?: string;
  fullName?: string;
  email?: string;
  serviceRequested?: string;
  location?: string;
  assignedSetter?: string;
  leadSource?: string;
  status?: LeadStatusInput;
  dqReason?: string | null;
  createdAt?: Date;
  now: Date;
}) {
  const leads = await getLeadsCollection();

  if (args.leadId) {
    const lead = await leads.findOne({ _id: toObjectId(args.leadId) });

    if (!lead) {
      throw new Error('Lead not found for provided lead_id.');
    }

    return {
      lead,
      subAccount: await requireDocument(
        await getSubAccountsCollection(),
        { _id: lead.sub_account_id },
        'Sub-account not found for provided lead.'
      )
    };
  }

  if (!args.phoneNumber) {
    throw new Error('phone_number is required when lead_id is not provided.');
  }

  const phoneNumber = normalizePhone(args.phoneNumber);

  if (phoneNumber.length < 10) {
    throw new Error('phone_number could not be normalized to a valid value.');
  }

  const subAccount = await resolveSubAccount({
    ghlSubAccountId: args.ghlSubAccountId,
    companyName: args.companyName,
    now: args.now
  });

  const existingLead = await leads.findOne({
    sub_account_id: subAccount._id,
    phone_number: phoneNumber
  });

  const desiredStatus =
    (args.status ? leadStatusMap[args.status] : undefined) ?? defaultLeadStatusForEvent(args.eventType);
  const createdAt = args.createdAt ?? args.now;

  if (!existingLead) {
    const leadToInsert: LeadDocument = {
      _id: new ObjectId(),
      sub_account_id: subAccount._id,
      phone_number: phoneNumber,
      full_name: args.fullName ?? null,
      email: args.email ?? null,
      service_requested: args.serviceRequested ?? null,
      location: args.location ?? null,
      assigned_setter: args.assignedSetter ?? null,
      status: desiredStatus ?? 'New',
      dq_reason: desiredStatus === 'DQ' ? args.dqReason ?? null : null,
      lead_source: args.leadSource ?? null,
      created_at: createdAt,
      updated_at: args.now
    };

    await leads.insertOne(leadToInsert);
    const lead = await requireDocument(leads, { _id: leadToInsert._id }, 'Lead not found after insert.');
    return { lead, subAccount };
  }

  const updateFields: Partial<LeadDocument> = {
    updated_at: args.now
  };

  if (args.fullName !== undefined) {
    updateFields.full_name = args.fullName;
  }
  if (args.email !== undefined) {
    updateFields.email = args.email;
  }
  if (args.serviceRequested !== undefined) {
    updateFields.service_requested = args.serviceRequested;
  }
  if (args.location !== undefined) {
    updateFields.location = args.location;
  }
  if (args.assignedSetter !== undefined) {
    updateFields.assigned_setter = args.assignedSetter;
  }
  if (args.leadSource !== undefined) {
    updateFields.lead_source = args.leadSource;
  }
  if (desiredStatus !== undefined) {
    updateFields.status = desiredStatus;
    updateFields.dq_reason = desiredStatus === 'DQ' ? args.dqReason ?? existingLead.dq_reason ?? null : null;
  } else if (args.dqReason !== undefined && existingLead.status === 'DQ') {
    updateFields.dq_reason = args.dqReason;
  }

  await leads.updateOne({ _id: existingLead._id }, { $set: updateFields });
  const lead = await requireDocument(leads, { _id: existingLead._id }, 'Lead not found after update.');
  return { lead, subAccount };
}

async function logMakeEvent(document: Omit<MakeReportingEventDocument, '_id'>) {
  const events = await getMakeReportingEventsCollection();
  const eventToInsert: MakeReportingEventDocument = {
    _id: new ObjectId(),
    ...document
  };

  await events.insertOne(eventToInsert);
  return eventToInsert;
}

export const ingestMakeReportingEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = makeReportingEventSchema.parse(req.body);
    const now = new Date();

    if (!leadLevelEventTypes.has(data.event_type)) {
      const event = await logMakeEvent({
        scenario_name: data.scenario_name,
        event_type: data.event_type,
        sheet_name: data.sheet_name ?? null,
        google_sheet_action: data.google_sheet_action ?? null,
        received_at: now,
        processed_at: now,
        processing_result: 'logged_only',
        payload: req.body as Record<string, unknown>,
        raw: data.raw ?? null
      });

      res.status(202).json({
        message: 'Make reporting event logged',
        processingResult: 'logged_only',
        event: serializeDocument(event)
      });
      return;
    }

    const { lead, subAccount } = await resolveLead({
      leadId: data.lead_id,
      eventType: data.event_type,
      ghlSubAccountId: data.ghl_sub_account_id,
      companyName: data.company_name,
      phoneNumber: data.phone_number,
      fullName: data.full_name,
      email: data.email,
      serviceRequested: data.service_requested,
      location: data.location,
      assignedSetter: data.assigned_setter,
      leadSource: data.lead_source,
      status: data.status,
      dqReason: data.dq_reason ?? null,
      createdAt: data.created_at ?? data.occurred_at,
      now
    });

    const leads = await getLeadsCollection();
    const leadMetrics = await getLeadMetricsCollection();
    let workingLead = lead;
    let metrics = await ensureLeadMetric(lead._id);

    const leadUpdateFields: Partial<LeadDocument> = {};
    const metricUpdateFields: Partial<LeadMetricDocument> = { updated_at: now };
    const metricIncrements: Partial<Record<'call_count' | 'sms_count' | 'email_count', number>> = {};

    switch (data.event_type) {
      case 'new_lead':
      case 'lead_source_update':
        break;
      case 'speed_to_lead': {
        const firstContactAt = data.first_contact_at ?? data.occurred_at ?? now;
        leadUpdateFields.first_contact_at = firstContactAt;
        leadUpdateFields.speed_to_lead_min =
          data.speed_to_lead_min ?? calculateSpeedToLeadMin(lead.created_at, firstContactAt);
        break;
      }
      case 'all_dial': {
        const incrementField = metricIncrementFieldMap[data.activity_type ?? 'call'];
        metricIncrements[incrementField] = data.activity_count ?? 1;
        metricUpdateFields.last_activity_at = data.occurred_at ?? now;

        if (!lead.first_contact_at) {
          const firstContactAt = data.first_contact_at ?? data.occurred_at ?? now;
          leadUpdateFields.first_contact_at = firstContactAt;
          leadUpdateFields.speed_to_lead_min = calculateSpeedToLeadMin(lead.created_at, firstContactAt);
        }
        break;
      }
      case 'appointment_booked':
        leadUpdateFields.status = 'Booked';
        if (data.appointment_date !== undefined) {
          metricUpdateFields.appointment_date = data.appointment_date;
        }
        if (data.activity_type) {
          const incrementField = metricIncrementFieldMap[data.activity_type];
          metricIncrements[incrementField] = data.activity_count ?? 1;
        }
        break;
      case 'appointment_cancelled':
        leadUpdateFields.appointment_cancelled_at = data.occurred_at ?? now;
        break;
      case 'appointment_rescheduled':
        leadUpdateFields.appointment_rescheduled_at = data.occurred_at ?? now;
        if (data.appointment_date !== undefined) {
          metricUpdateFields.appointment_date = data.appointment_date;
        }
        break;
      case 'showed':
        metricUpdateFields.showed_up = 'Yes';
        break;
      case 'no_show':
        metricUpdateFields.showed_up = 'No';
        break;
      case 'disqualified':
        leadUpdateFields.status = 'DQ';
        leadUpdateFields.dq_reason = data.dq_reason ?? lead.dq_reason ?? null;
        break;
      case 'aged_lead':
        leadUpdateFields.status = 'Aged';
        break;
      case 'dnd':
        leadUpdateFields.dnd_at = data.occurred_at ?? now;
        break;
      case 'in_conversation':
        leadUpdateFields.in_conversation_at = data.occurred_at ?? now;
        break;
      case 'off_shift_appointment_request':
        leadUpdateFields.off_shift_appointment_requested_at = data.occurred_at ?? now;
        break;
      case 'virtual_quote':
        leadUpdateFields.virtual_quote_at = data.occurred_at ?? now;
        break;
      case 'recording_summary':
        if (data.recording_url !== undefined) {
          metricUpdateFields.recording_url = data.recording_url;
        }
        if (data.call_summary !== undefined) {
          metricUpdateFields.call_summary = data.call_summary;
        }
        if (data.occurred_at !== undefined) {
          metricUpdateFields.last_activity_at = data.occurred_at;
        }
        break;
      default:
        break;
    }

    if (data.showed_up !== undefined) {
      metricUpdateFields.showed_up = attendanceStatusMap[data.showed_up];
    }
    if (data.appointment_date !== undefined) {
      metricUpdateFields.appointment_date = data.appointment_date;
    }
    if (data.call_count_delta !== undefined) {
      metricIncrements.call_count = (metricIncrements.call_count ?? 0) + data.call_count_delta;
    }
    if (data.sms_count_delta !== undefined) {
      metricIncrements.sms_count = (metricIncrements.sms_count ?? 0) + data.sms_count_delta;
    }
    if (data.email_count_delta !== undefined) {
      metricIncrements.email_count = (metricIncrements.email_count ?? 0) + data.email_count_delta;
    }

    if (Object.keys(leadUpdateFields).length > 0) {
      leadUpdateFields.updated_at = now;
      await leads.updateOne({ _id: lead._id }, { $set: leadUpdateFields });
      workingLead = await requireDocument(leads, { _id: lead._id }, 'Lead not found after Make event update.');
    }

    if (
      Object.keys(metricUpdateFields).length > 1 ||
      Object.keys(metricIncrements).length > 0
    ) {
      const metricUpdate: Record<string, unknown> = {
        $set: metricUpdateFields
      };

      if (Object.keys(metricIncrements).length > 0) {
        metricUpdate.$inc = metricIncrements;
      }

      await leadMetrics.updateOne({ lead_id: lead._id }, metricUpdate);
      metrics = await requireDocument(
        leadMetrics,
        { lead_id: lead._id },
        'Lead metric not found after Make event update.'
      );
    }

    const event = await logMakeEvent({
      scenario_name: data.scenario_name,
      event_type: data.event_type,
      sheet_name: data.sheet_name ?? null,
      google_sheet_action: data.google_sheet_action ?? null,
      received_at: now,
      processed_at: new Date(),
      processing_result: 'processed',
      lead_id: workingLead._id,
      sub_account_id: subAccount._id,
      payload: req.body as Record<string, unknown>,
      raw: data.raw ?? null
    });

    res.status(200).json({
      message: 'Make reporting event processed',
      processingResult: 'processed',
      lead: await hydrateLead(workingLead),
      metrics: serializeDocument(metrics),
      event: serializeDocument(event)
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
