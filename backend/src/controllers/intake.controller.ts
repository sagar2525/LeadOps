import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  AttendanceStatus,
  LeadDocument,
  LeadMetricDocument,
  LeadStatus,
  getLeadMetricsCollection,
  getLeadsCollection,
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
  leadActivitySchema,
  leadIngestSchema,
  leadStatusUpdateSchema
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

export const ingestLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = leadIngestSchema.parse(req.body);
    const phoneNumber = normalizePhone(data.phone_number);

    if (phoneNumber.length < 10) {
      res.status(400).json({ error: 'phone_number could not be normalized to a valid value.' });
      return;
    }

    const subAccounts = await getSubAccountsCollection();
    const leads = await getLeadsCollection();
    const now = new Date();

    await subAccounts.updateOne(
      { ghl_sub_account_id: data.ghl_sub_account_id },
      {
        $set: {
          company_name: data.company_name,
          is_active: true,
          updated_at: now
        },
        $setOnInsert: {
          created_at: now
        }
      },
      { upsert: true }
    );

    const subAccount = await requireDocument(
      subAccounts,
      {
      ghl_sub_account_id: data.ghl_sub_account_id
      },
      'Sub-account not found after upsert.'
    );

    const existingLead = await leads.findOne({
      sub_account_id: subAccount._id,
      phone_number: phoneNumber
    });

    if (!existingLead) {
      const createdAt = data.created_at ?? now;

      const leadId = new ObjectId();
      const leadToInsert: LeadDocument = {
        _id: leadId,
        sub_account_id: subAccount._id,
        phone_number: phoneNumber,
        full_name: data.full_name ?? null,
        email: data.email ?? null,
        service_requested: data.service_requested ?? null,
        location: data.location ?? null,
        assigned_setter: data.assigned_setter ?? null,
        status: data.status ? leadStatusMap[data.status] : 'New',
        dq_reason: data.status === 'DQ' ? data.dq_reason ?? null : null,
        created_at: createdAt,
        updated_at: now,
        first_contact_at: null,
        speed_to_lead_min: null
      };

      await leads.insertOne(leadToInsert);
      const lead = await requireDocument(
        leads,
        { _id: leadId },
        'Lead not found after insert.'
      );
      await ensureLeadMetric(lead._id);

      res.status(201).json({ message: 'Lead created', lead: await hydrateLead(lead) });
      return;
    }

    const updateFields: Partial<Omit<LeadDocument, '_id' | 'sub_account_id' | 'phone_number' | 'created_at'>> = {
      updated_at: now
    };

    if (data.full_name !== undefined) {
      updateFields.full_name = data.full_name;
    }
    if (data.email !== undefined) {
      updateFields.email = data.email;
    }
    if (data.service_requested !== undefined) {
      updateFields.service_requested = data.service_requested;
    }
    if (data.location !== undefined) {
      updateFields.location = data.location;
    }
    if (data.assigned_setter !== undefined) {
      updateFields.assigned_setter = data.assigned_setter;
    }
    if (data.status !== undefined) {
      updateFields.status = leadStatusMap[data.status];
      updateFields.dq_reason =
        data.status === 'DQ' ? data.dq_reason ?? existingLead.dq_reason ?? null : null;
    } else if (data.dq_reason !== undefined && existingLead.status === 'DQ') {
      updateFields.dq_reason = data.dq_reason;
    }

    await leads.updateOne(
      { _id: existingLead._id },
      { $set: updateFields }
    );

    await ensureLeadMetric(existingLead._id);
    const lead = await requireDocument(leads, { _id: existingLead._id }, 'Lead not found after update.');

    res.status(200).json({ message: 'Lead updated', lead: await hydrateLead(lead) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const logLeadActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = leadActivitySchema.parse(req.body);
    const leadId = toObjectId(data.lead_id);
    const leads = await getLeadsCollection();
    const leadMetrics = await getLeadMetricsCollection();

    const lead = await leads.findOne({ _id: leadId });

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const now = new Date();
    let updatedLead = lead;

    if (!lead.first_contact_at) {
      const speedToLeadMin = calculateSpeedToLeadMin(lead.created_at, now);
      await leads.updateOne(
        { _id: lead._id },
        {
          $set: {
            first_contact_at: now,
            speed_to_lead_min: speedToLeadMin,
            updated_at: now
          }
        }
      );
      updatedLead = await requireDocument(leads, { _id: lead._id }, 'Lead not found after activity update.');
    }

    const incrementField = metricIncrementFieldMap[data.type];
    await ensureLeadMetric(lead._id);

    await leadMetrics.updateOne(
      { lead_id: lead._id },
      {
        $inc: { [incrementField]: 1 },
        $set: { updated_at: now }
      }
    );

    const metrics = await requireDocument(
      leadMetrics,
      { lead_id: lead._id },
      'Lead metric not found after activity update.'
    );

    res.status(200).json({
      message: 'Lead activity logged',
      lead: await hydrateLead(updatedLead),
      metrics: serializeDocument(metrics)
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateLeadStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = leadStatusUpdateSchema.parse(req.body);
    const leadId = toObjectId(data.lead_id);
    const leads = await getLeadsCollection();
    const leadMetrics = await getLeadMetricsCollection();

    const lead = await leads.findOne({ _id: leadId });

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const leadUpdateFields: Partial<Omit<LeadDocument, '_id' | 'sub_account_id' | 'phone_number' | 'created_at'>> = {};

    if (data.status !== undefined) {
      leadUpdateFields.status = leadStatusMap[data.status];
      leadUpdateFields.dq_reason =
        data.status === 'DQ' ? data.dq_reason ?? lead.dq_reason ?? null : null;
    } else if (data.dq_reason !== undefined) {
      leadUpdateFields.dq_reason = data.dq_reason;
    }

    if (Object.keys(leadUpdateFields).length > 0) {
      leadUpdateFields.updated_at = new Date();
      await leads.updateOne(
        { _id: lead._id },
        { $set: leadUpdateFields }
      );
    }

    if (data.showed_up !== undefined || data.appointment_date !== undefined) {
      await ensureLeadMetric(lead._id);

      const metricUpdateFields: Partial<Omit<LeadMetricDocument, '_id' | 'lead_id' | 'call_count' | 'sms_count' | 'email_count'>> = {
        updated_at: new Date()
      };

      if (data.showed_up !== undefined) {
        metricUpdateFields.showed_up = attendanceStatusMap[data.showed_up];
      }
      if (data.appointment_date !== undefined) {
        metricUpdateFields.appointment_date = data.appointment_date;
      }

      await leadMetrics.updateOne(
        { lead_id: lead._id },
        {
          $set: metricUpdateFields
        }
      );
    } else {
      await ensureLeadMetric(lead._id);
    }

    const updatedLead = await requireDocument(
      leads,
      { _id: lead._id },
      'Lead not found after status update.'
    );

    res.status(200).json({
      message: 'Lead status updated',
      lead: await hydrateLead(updatedLead)
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
