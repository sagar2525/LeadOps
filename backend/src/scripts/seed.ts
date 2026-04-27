import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
import {
  LeadDocument,
  LeadMetricDocument,
  SubAccountDocument,
  getLeadMetricsCollection,
  getLeadsCollection,
  getMongoClient,
  getSubAccountsCollection,
  initializeMongo
} from '../lib/mongo';

dotenv.config();

type SeedLead = {
  phone_number: string;
  full_name: string;
  email: string;
  service_requested: string;
  location: string;
  assigned_setter: string;
  status: LeadDocument['status'];
  dq_reason?: string | null;
  created_at: Date;
  first_contact_at?: Date | null;
  speed_to_lead_min?: number | null;
  metrics: Omit<LeadMetricDocument, '_id' | 'lead_id' | 'updated_at'> & {
    updated_at?: Date;
  };
};

type SeedSubAccount = {
  ghl_sub_account_id: string;
  company_name: string;
  leads: SeedLead[];
};

const now = new Date();

const seedData: SeedSubAccount[] = [
  {
    ghl_sub_account_id: 'ghl-hom-atlanta',
    company_name: 'HOM Atlanta Roofing',
    leads: [
      {
        phone_number: '14045550101',
        full_name: 'Marcus Hill',
        email: 'marcus.hill@example.com',
        service_requested: 'Roof Inspection',
        location: 'Atlanta, GA',
        assigned_setter: 'Sarah Lopez',
        status: 'Booked',
        created_at: new Date('2026-04-10T14:00:00.000Z'),
        first_contact_at: new Date('2026-04-10T14:07:00.000Z'),
        speed_to_lead_min: 7,
        metrics: {
          call_count: 3,
          sms_count: 2,
          email_count: 1,
          appointment_date: new Date('2026-04-15T16:00:00.000Z'),
          showed_up: 'Yes'
        }
      },
      {
        phone_number: '14045550102',
        full_name: 'Danielle Carter',
        email: 'danielle.carter@example.com',
        service_requested: 'Siding Quote',
        location: 'Marietta, GA',
        assigned_setter: 'Sarah Lopez',
        status: 'In Progress',
        created_at: new Date('2026-04-16T15:30:00.000Z'),
        first_contact_at: new Date('2026-04-16T15:42:00.000Z'),
        speed_to_lead_min: 12,
        metrics: {
          call_count: 1,
          sms_count: 3,
          email_count: 0,
          appointment_date: null,
          showed_up: 'Pending'
        }
      },
      {
        phone_number: '14045550103',
        full_name: 'Evan Brooks',
        email: 'evan.brooks@example.com',
        service_requested: 'Gutter Repair',
        location: 'Sandy Springs, GA',
        assigned_setter: 'Jordan Price',
        status: 'DQ',
        dq_reason: 'Outside service area',
        created_at: new Date('2026-04-12T13:15:00.000Z'),
        first_contact_at: new Date('2026-04-12T13:50:00.000Z'),
        speed_to_lead_min: 35,
        metrics: {
          call_count: 1,
          sms_count: 0,
          email_count: 0,
          appointment_date: null,
          showed_up: 'Pending'
        }
      }
    ]
  },
  {
    ghl_sub_account_id: 'ghl-hom-dallas',
    company_name: 'HOM Dallas Solar',
    leads: [
      {
        phone_number: '14695550101',
        full_name: 'Olivia Nguyen',
        email: 'olivia.nguyen@example.com',
        service_requested: 'Solar Consultation',
        location: 'Dallas, TX',
        assigned_setter: 'Mike Turner',
        status: 'Booked',
        created_at: new Date('2026-04-11T18:10:00.000Z'),
        first_contact_at: new Date('2026-04-11T18:14:00.000Z'),
        speed_to_lead_min: 4,
        metrics: {
          call_count: 2,
          sms_count: 1,
          email_count: 2,
          appointment_date: new Date('2026-04-18T19:00:00.000Z'),
          showed_up: 'No'
        }
      },
      {
        phone_number: '14695550102',
        full_name: 'Carlos Mendoza',
        email: 'carlos.mendoza@example.com',
        service_requested: 'Battery Backup',
        location: 'Plano, TX',
        assigned_setter: 'Mike Turner',
        status: 'Aged',
        created_at: new Date('2026-03-20T17:00:00.000Z'),
        first_contact_at: new Date('2026-03-20T17:25:00.000Z'),
        speed_to_lead_min: 25,
        metrics: {
          call_count: 4,
          sms_count: 5,
          email_count: 1,
          appointment_date: null,
          showed_up: 'Pending'
        }
      }
    ]
  },
  {
    ghl_sub_account_id: 'ghl-hom-miami',
    company_name: 'HOM Miami Windows',
    leads: [
      {
        phone_number: '13055550101',
        full_name: 'Sophia Reed',
        email: 'sophia.reed@example.com',
        service_requested: 'Impact Windows',
        location: 'Miami, FL',
        assigned_setter: 'Ava Collins',
        status: 'New',
        created_at: new Date('2026-04-20T09:00:00.000Z'),
        first_contact_at: null,
        speed_to_lead_min: null,
        metrics: {
          call_count: 0,
          sms_count: 0,
          email_count: 0,
          appointment_date: null,
          showed_up: 'Pending'
        }
      }
    ]
  }
];

async function upsertSubAccount(subAccountSeed: SeedSubAccount) {
  const subAccounts = await getSubAccountsCollection();

  await subAccounts.updateOne(
    { ghl_sub_account_id: subAccountSeed.ghl_sub_account_id },
    {
      $set: {
        company_name: subAccountSeed.company_name,
        is_active: true,
        updated_at: now
      },
      $setOnInsert: {
        created_at: now
      }
    },
    { upsert: true }
  );

  const subAccount = await subAccounts.findOne({
    ghl_sub_account_id: subAccountSeed.ghl_sub_account_id
  });

  if (!subAccount) {
    throw new Error(`Failed to upsert sub-account ${subAccountSeed.ghl_sub_account_id}`);
  }

  return subAccount;
}

async function upsertLead(subAccount: SubAccountDocument, leadSeed: SeedLead) {
  const leads = await getLeadsCollection();
  const leadId = new ObjectId();

  const baseLead: LeadDocument = {
    _id: leadId,
    sub_account_id: subAccount._id,
    phone_number: leadSeed.phone_number,
    full_name: leadSeed.full_name,
    email: leadSeed.email,
    service_requested: leadSeed.service_requested,
    location: leadSeed.location,
    assigned_setter: leadSeed.assigned_setter,
    status: leadSeed.status,
    dq_reason: leadSeed.status === 'DQ' ? leadSeed.dq_reason ?? null : null,
    created_at: leadSeed.created_at,
    updated_at: now,
    first_contact_at: leadSeed.first_contact_at ?? null,
    speed_to_lead_min: leadSeed.speed_to_lead_min ?? null
  };

  await leads.updateOne(
    {
      sub_account_id: subAccount._id,
      phone_number: leadSeed.phone_number
    },
    {
      $set: {
        full_name: baseLead.full_name,
        email: baseLead.email,
        service_requested: baseLead.service_requested,
        location: baseLead.location,
        assigned_setter: baseLead.assigned_setter,
        status: baseLead.status,
        dq_reason: baseLead.dq_reason,
        updated_at: now,
        first_contact_at: baseLead.first_contact_at,
        speed_to_lead_min: baseLead.speed_to_lead_min
      },
      $setOnInsert: {
        _id: baseLead._id,
        sub_account_id: baseLead.sub_account_id,
        phone_number: baseLead.phone_number,
        created_at: baseLead.created_at
      }
    },
    { upsert: true }
  );

  const lead = await leads.findOne({
    sub_account_id: subAccount._id,
    phone_number: leadSeed.phone_number
  });

  if (!lead) {
    throw new Error(`Failed to upsert lead ${leadSeed.phone_number}`);
  }

  return lead;
}

async function upsertLeadMetric(lead: LeadDocument, leadSeed: SeedLead) {
  const leadMetrics = await getLeadMetricsCollection();

  await leadMetrics.updateOne(
    { lead_id: lead._id },
    {
      $set: {
        call_count: leadSeed.metrics.call_count,
        sms_count: leadSeed.metrics.sms_count,
        email_count: leadSeed.metrics.email_count,
        appointment_date: leadSeed.metrics.appointment_date ?? null,
        showed_up: leadSeed.metrics.showed_up,
        updated_at: leadSeed.metrics.updated_at ?? now
      },
      $setOnInsert: {
        _id: new ObjectId(),
        lead_id: lead._id
      }
    },
    { upsert: true }
  );
}

async function seed() {
  await initializeMongo();

  let subAccountCount = 0;
  let leadCount = 0;

  for (const subAccountSeed of seedData) {
    const subAccount = await upsertSubAccount(subAccountSeed);
    subAccountCount += 1;

    for (const leadSeed of subAccountSeed.leads) {
      const lead = await upsertLead(subAccount, leadSeed);
      await upsertLeadMetric(lead, leadSeed);
      leadCount += 1;
    }
  }

  console.log(`Seed completed. Upserted ${subAccountCount} sub-accounts and ${leadCount} leads.`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    const client = await getMongoClient();
    await client.close();
  });
