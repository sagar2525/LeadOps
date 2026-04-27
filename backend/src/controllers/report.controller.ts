import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongo';

type JoinedLead = {
  _id: ObjectId;
  phone_number: string;
  full_name?: string | null;
  email?: string | null;
  service_requested?: string | null;
  location?: string | null;
  assigned_setter?: string | null;
  status: 'New' | 'In Progress' | 'Booked' | 'Aged' | 'DQ';
  dq_reason?: string | null;
  created_at: Date;
  updated_at: Date;
  first_contact_at?: Date | null;
  speed_to_lead_min?: number | null;
  company_name?: string | null;
  ghl_sub_account_id?: string | null;
  metrics?: {
    call_count: number;
    sms_count: number;
    email_count: number;
    appointment_date?: Date | null;
    showed_up: 'Pending' | 'Yes' | 'No';
    updated_at: Date;
  } | null;
};

type DashboardSummary = {
  generatedAt: string;
  filters: {
    from: string | null;
    to: string | null;
  };
  overview: {
    totalLeads: number;
    contactedLeads: number;
    bookedAppointments: number;
    apptBookingRatePct: number;
    qualApptBookingRatePct: number;
    leadsInProgress: number;
    disqualified: number;
    agedLeads: number;
    shows: number;
    noShows: number;
    showRatePct: number;
  };
  activity: {
    avgSpeedToLeadMin: number;
    outboundDials: number;
    outboundSms: number;
    outboundEmails: number;
    callBookedAppointments: number;
    smsBookedAppointments: number;
    emailBookedAppointments: number;
    upcomingAppointments: number;
  };
  funnel: Array<{ label: string; value: number }>;
  dqBreakdown: Array<{ reason: string; count: number }>;
  byCompany: Array<{
    companyName: string;
    ghlSubAccountId: string;
    leadCount: number;
    contactedCount: number;
    bookedCount: number;
    showCount: number;
    noShowCount: number;
    dialCount: number;
    bookingRatePct: number;
    qualBookingRatePct: number;
    showRatePct: number;
    avgSpeedToLeadMin: number;
    setters: Array<{
      setterName: string;
      leadCount: number;
      bookedCount: number;
      showCount: number;
      dialCount: number;
      bookingRatePct: number;
      showRatePct: number;
      avgSpeedToLeadMin: number;
    }>;
  }>;
  agedLeadRows: Array<{
    id: string;
    fullName: string;
    phoneNumber: string;
    companyName: string;
    assignedSetter: string;
    status: string;
    createdAt: Date;
    daysOpen: number;
    speedToLeadMin: number;
    callCount: number;
    smsCount: number;
    emailCount: number;
  }>;
};

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return round((numerator / denominator) * 100, 1);
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function daysOpen(from: Date, to: Date) {
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

function hasAppointment(lead: JoinedLead) {
  return lead.status === 'Booked' || lead.metrics?.appointment_date != null;
}

function hasContact(lead: JoinedLead) {
  return (
    lead.first_contact_at != null ||
    (lead.metrics?.call_count ?? 0) > 0 ||
    (lead.metrics?.sms_count ?? 0) > 0 ||
    (lead.metrics?.email_count ?? 0) > 0
  );
}

function isAgedLead(lead: JoinedLead, now: Date) {
  return lead.status === 'Aged' || (lead.status === 'In Progress' && daysOpen(lead.created_at, now) > 14);
}

async function loadJoinedLeads(from: Date | null, to: Date | null) {
  const db = await getDatabase();

  const createdAtMatch: Record<string, Date> = {};

  if (from) {
    createdAtMatch.$gte = from;
  }

  if (to) {
    createdAtMatch.$lte = to;
  }

  const matchStage =
    Object.keys(createdAtMatch).length > 0
      ? [{ $match: { created_at: createdAtMatch } }]
      : [];

  return (await db
    .collection('leads')
    .aggregate<JoinedLead>([
      ...matchStage,
      {
        $lookup: {
          from: 'sub_accounts',
          localField: 'sub_account_id',
          foreignField: '_id',
          as: 'sub_account'
        }
      },
      {
        $unwind: {
          path: '$sub_account',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'lead_metrics',
          localField: '_id',
          foreignField: 'lead_id',
          as: 'metrics'
        }
      },
      {
        $unwind: {
          path: '$metrics',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          phone_number: 1,
          full_name: 1,
          email: 1,
          service_requested: 1,
          location: 1,
          assigned_setter: 1,
          status: 1,
          dq_reason: 1,
          created_at: 1,
          updated_at: 1,
          first_contact_at: 1,
          speed_to_lead_min: 1,
          company_name: '$sub_account.company_name',
          ghl_sub_account_id: '$sub_account.ghl_sub_account_id',
          metrics: 1
        }
      }
    ])
    .toArray()) as JoinedLead[];
}

async function buildDashboardSummary(from: Date | null, to: Date | null): Promise<DashboardSummary> {
  const now = new Date();
  const leads = await loadJoinedLeads(from, to);
  const totalLeads = leads.length;
  const contactedLeads = leads.filter(hasContact);
  const bookedLeads = leads.filter(hasAppointment);
  const inProgressLeads = leads.filter((lead) => lead.status === 'In Progress');
  const disqualifiedLeads = leads.filter((lead) => lead.status === 'DQ');
  const agedLeads = leads.filter((lead) => isAgedLead(lead, now));
  const showedLeads = leads.filter((lead) => lead.metrics?.showed_up === 'Yes');
  const noShowLeads = leads.filter((lead) => lead.metrics?.showed_up === 'No');
  const avgSpeedSamples = leads.filter(
    (lead) => typeof lead.speed_to_lead_min === 'number' && lead.speed_to_lead_min >= 0
  );
  const outboundDials = leads.reduce((sum, lead) => sum + (lead.metrics?.call_count ?? 0), 0);
  const outboundSms = leads.reduce((sum, lead) => sum + (lead.metrics?.sms_count ?? 0), 0);
  const outboundEmails = leads.reduce((sum, lead) => sum + (lead.metrics?.email_count ?? 0), 0);
  const callBookedAppointments = bookedLeads.filter((lead) => (lead.metrics?.call_count ?? 0) > 0).length;
  const smsBookedAppointments = bookedLeads.filter((lead) => (lead.metrics?.sms_count ?? 0) > 0).length;
  const emailBookedAppointments = bookedLeads.filter((lead) => (lead.metrics?.email_count ?? 0) > 0).length;
  const upcomingAppointments = bookedLeads.filter(
    (lead) =>
      lead.metrics?.appointment_date != null &&
      new Date(lead.metrics.appointment_date).getTime() > now.getTime() &&
      lead.metrics?.showed_up !== 'Yes' &&
      lead.metrics?.showed_up !== 'No'
  ).length;

  const avgSpeedToLeadMin =
    avgSpeedSamples.length > 0
      ? round(
          avgSpeedSamples.reduce((sum, lead) => sum + (lead.speed_to_lead_min ?? 0), 0) /
            avgSpeedSamples.length,
          2
        )
      : 0;

  const dqReasonMap = new Map<string, number>();

  for (const lead of disqualifiedLeads) {
    const reason = lead.dq_reason?.trim() || 'Unspecified';
    dqReasonMap.set(reason, (dqReasonMap.get(reason) ?? 0) + 1);
  }

  const companyMap = new Map<
    string,
    {
      companyName: string;
      ghlSubAccountId: string;
      leadCount: number;
      contactedCount: number;
      bookedCount: number;
      showCount: number;
      noShowCount: number;
      dialCount: number;
      avgSpeedTotal: number;
      avgSpeedCount: number;
      setters: Map<
        string,
        {
          setterName: string;
          leadCount: number;
          bookedCount: number;
          showCount: number;
          dialCount: number;
          avgSpeedTotal: number;
          avgSpeedCount: number;
        }
      >;
    }
  >();

  for (const lead of leads) {
    const companyName = lead.company_name || 'Unassigned Company';
    const companyKey = lead.ghl_sub_account_id || companyName;
    const setterName = lead.assigned_setter || 'Unassigned Setter';

    if (!companyMap.has(companyKey)) {
      companyMap.set(companyKey, {
        companyName,
        ghlSubAccountId: lead.ghl_sub_account_id || '',
        leadCount: 0,
        contactedCount: 0,
        bookedCount: 0,
        showCount: 0,
        noShowCount: 0,
        dialCount: 0,
        avgSpeedTotal: 0,
        avgSpeedCount: 0,
        setters: new Map()
      });
    }

    const company = companyMap.get(companyKey)!;
    company.leadCount += 1;
    company.dialCount += lead.metrics?.call_count ?? 0;

    if (hasContact(lead)) {
      company.contactedCount += 1;
    }
    if (hasAppointment(lead)) {
      company.bookedCount += 1;
    }
    if (lead.metrics?.showed_up === 'Yes') {
      company.showCount += 1;
    }
    if (lead.metrics?.showed_up === 'No') {
      company.noShowCount += 1;
    }
    if (typeof lead.speed_to_lead_min === 'number') {
      company.avgSpeedTotal += lead.speed_to_lead_min;
      company.avgSpeedCount += 1;
    }

    if (!company.setters.has(setterName)) {
      company.setters.set(setterName, {
        setterName,
        leadCount: 0,
        bookedCount: 0,
        showCount: 0,
        dialCount: 0,
        avgSpeedTotal: 0,
        avgSpeedCount: 0
      });
    }

    const setter = company.setters.get(setterName)!;
    setter.leadCount += 1;
    setter.dialCount += lead.metrics?.call_count ?? 0;
    if (hasAppointment(lead)) {
      setter.bookedCount += 1;
    }
    if (lead.metrics?.showed_up === 'Yes') {
      setter.showCount += 1;
    }
    if (typeof lead.speed_to_lead_min === 'number') {
      setter.avgSpeedTotal += lead.speed_to_lead_min;
      setter.avgSpeedCount += 1;
    }
  }

  const byCompany = Array.from(companyMap.values())
    .map((company) => ({
      companyName: company.companyName,
      ghlSubAccountId: company.ghlSubAccountId,
      leadCount: company.leadCount,
      contactedCount: company.contactedCount,
      bookedCount: company.bookedCount,
      showCount: company.showCount,
      noShowCount: company.noShowCount,
      dialCount: company.dialCount,
      bookingRatePct: percent(company.bookedCount, company.leadCount),
      qualBookingRatePct: percent(company.bookedCount, company.contactedCount),
      showRatePct: percent(company.showCount, company.bookedCount),
      avgSpeedToLeadMin:
        company.avgSpeedCount > 0 ? round(company.avgSpeedTotal / company.avgSpeedCount, 2) : 0,
      setters: Array.from(company.setters.values())
        .map((setter) => ({
          setterName: setter.setterName,
          leadCount: setter.leadCount,
          bookedCount: setter.bookedCount,
          showCount: setter.showCount,
          dialCount: setter.dialCount,
          bookingRatePct: percent(setter.bookedCount, setter.leadCount),
          showRatePct: percent(setter.showCount, setter.bookedCount),
          avgSpeedToLeadMin:
            setter.avgSpeedCount > 0 ? round(setter.avgSpeedTotal / setter.avgSpeedCount, 2) : 0
        }))
        .sort((a, b) => b.bookedCount - a.bookedCount || b.leadCount - a.leadCount)
    }))
    .sort((a, b) => b.bookedCount - a.bookedCount || b.leadCount - a.leadCount);

  const agedLeadRows = agedLeads
    .map((lead) => ({
      id: lead._id.toHexString(),
      fullName: lead.full_name || 'Unknown Lead',
      phoneNumber: lead.phone_number,
      companyName: lead.company_name || 'Unassigned Company',
      assignedSetter: lead.assigned_setter || 'Unassigned Setter',
      status: lead.status,
      createdAt: lead.created_at,
      daysOpen: daysOpen(lead.created_at, now),
      speedToLeadMin: lead.speed_to_lead_min ?? 0,
      callCount: lead.metrics?.call_count ?? 0,
      smsCount: lead.metrics?.sms_count ?? 0,
      emailCount: lead.metrics?.email_count ?? 0
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen);

  return {
    generatedAt: now.toISOString(),
    filters: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null
    },
    overview: {
      totalLeads,
      contactedLeads: contactedLeads.length,
      bookedAppointments: bookedLeads.length,
      apptBookingRatePct: percent(bookedLeads.length, totalLeads),
      qualApptBookingRatePct: percent(bookedLeads.length, contactedLeads.length),
      leadsInProgress: inProgressLeads.length,
      disqualified: disqualifiedLeads.length,
      agedLeads: agedLeads.length,
      shows: showedLeads.length,
      noShows: noShowLeads.length,
      showRatePct: percent(showedLeads.length, bookedLeads.length)
    },
    activity: {
      avgSpeedToLeadMin,
      outboundDials,
      outboundSms,
      outboundEmails,
      callBookedAppointments,
      smsBookedAppointments,
      emailBookedAppointments,
      upcomingAppointments
    },
    funnel: [
      { label: 'Total Leads', value: totalLeads },
      { label: 'Contacted Leads', value: contactedLeads.length },
      { label: 'Booked Appts', value: bookedLeads.length },
      { label: 'Showed Up', value: showedLeads.length }
    ],
    dqBreakdown: Array.from(dqReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    byCompany,
    agedLeadRows
  };
}

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const summary = await buildDashboardSummary(from, to);
    res.status(200).json(summary);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const streamDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const db = await getDatabase();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');

    const sendSummary = async () => {
      const summary = await buildDashboardSummary(from, to);
      res.write(`data: ${JSON.stringify(summary)}\n\n`);
    };

    await sendSummary();

    const heartbeat = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 25000);

    const changeStream = db.watch(
      [
        {
          $match: {
            'ns.coll': {
              $in: ['sub_accounts', 'leads', 'lead_metrics']
            }
          }
        }
      ],
      { fullDocument: 'updateLookup' }
    );

    changeStream.on('change', () => {
      void sendSummary();
    });

    changeStream.on('error', (error: any) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      void changeStream.close();
      res.end();
    });
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
};
