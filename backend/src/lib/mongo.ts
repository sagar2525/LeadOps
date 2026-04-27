import { Collection, Document, MongoClient, ObjectId } from 'mongodb';

const databaseName = 'hom_reporting';
const subAccountsCollectionName = 'sub_accounts';
const leadsCollectionName = 'leads';
const leadMetricsCollectionName = 'lead_metrics';
const makeEventsCollectionName = 'make_reporting_events';

export type LeadStatus = 'New' | 'In Progress' | 'Booked' | 'Aged' | 'DQ';
export type AttendanceStatus = 'Pending' | 'Yes' | 'No';

export interface SubAccountDocument {
  _id: ObjectId;
  ghl_sub_account_id: string;
  company_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface LeadDocument {
  _id: ObjectId;
  sub_account_id: ObjectId;
  phone_number: string;
  full_name?: string | null;
  email?: string | null;
  service_requested?: string | null;
  location?: string | null;
  assigned_setter?: string | null;
  status: LeadStatus;
  dq_reason?: string | null;
  lead_source?: string | null;
  created_at: Date;
  updated_at: Date;
  first_contact_at?: Date | null;
  speed_to_lead_min?: number | null;
  appointment_cancelled_at?: Date | null;
  appointment_rescheduled_at?: Date | null;
  dnd_at?: Date | null;
  in_conversation_at?: Date | null;
  off_shift_appointment_requested_at?: Date | null;
  virtual_quote_at?: Date | null;
}

export interface LeadMetricDocument {
  _id: ObjectId;
  lead_id: ObjectId;
  call_count: number;
  sms_count: number;
  email_count: number;
  appointment_date?: Date | null;
  showed_up: AttendanceStatus;
  updated_at: Date;
  recording_url?: string | null;
  call_summary?: string | null;
  last_activity_at?: Date | null;
}

export interface MakeReportingEventDocument {
  _id: ObjectId;
  scenario_name: string;
  event_type: string;
  sheet_name?: string | null;
  google_sheet_action?: string | null;
  received_at: Date;
  processed_at: Date;
  processing_result: 'processed' | 'logged_only';
  lead_id?: ObjectId | null;
  sub_account_id?: ObjectId | null;
  payload: Record<string, unknown>;
  raw?: Record<string, unknown> | null;
}

let client: MongoClient | null = null;
let initialized = false;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }

  return url;
}

export function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(getDatabaseUrl());
    await client.connect();
  }

  return client;
}

export async function getDatabase() {
  const mongoClient = await getMongoClient();
  return mongoClient.db(databaseName);
}

async function ensureCollection(name: string) {
  const db = await getDatabase();
  const collections = await db.listCollections({ name }).toArray();

  if (collections.length === 0) {
    await db.createCollection(name);
  }
}

async function applyValidator(name: string, validator: Record<string, unknown>) {
  const db = await getDatabase();
  await db.command({
    collMod: name,
    validator,
    validationLevel: 'strict',
    validationAction: 'error'
  });
}

function keysMatch(
  existingKey: Record<string, unknown>,
  desiredKey: Record<string, number>
) {
  const existingEntries = Object.entries(existingKey);
  const desiredEntries = Object.entries(desiredKey);

  if (existingEntries.length !== desiredEntries.length) {
    return false;
  }

  return desiredEntries.every(([field, direction]) =>
    existingEntries.some(
      ([existingField, existingDirection]) =>
        existingField === field && Number(existingDirection) === direction
    )
  );
}

async function ensureIndex<T extends Document>(
  collection: Collection<T>,
  key: Record<string, number>,
  options: { unique?: boolean; name: string }
) {
  const existingIndexes = await collection.listIndexes().toArray();
  const matchingIndex = existingIndexes.find((index) => keysMatch(index.key, key));

  if (matchingIndex) {
    return matchingIndex.name;
  }

  return collection.createIndex(key, options);
}

export async function initializeMongo() {
  if (initialized) {
    return;
  }

  await getMongoClient();
  await ensureCollection(subAccountsCollectionName);
  await ensureCollection(leadsCollectionName);
  await ensureCollection(leadMetricsCollectionName);
  await ensureCollection(makeEventsCollectionName);

  await applyValidator(subAccountsCollectionName, {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ghl_sub_account_id', 'company_name', 'is_active', 'created_at', 'updated_at'],
      properties: {
        ghl_sub_account_id: { bsonType: 'string', minLength: 1 },
        company_name: { bsonType: 'string', minLength: 1 },
        is_active: { bsonType: 'bool' },
        created_at: { bsonType: 'date' },
        updated_at: { bsonType: 'date' }
      }
    }
  });

  await applyValidator(leadsCollectionName, {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sub_account_id', 'phone_number', 'status', 'created_at', 'updated_at'],
      properties: {
        sub_account_id: { bsonType: 'objectId' },
        phone_number: { bsonType: 'string', minLength: 1 },
        full_name: { bsonType: ['string', 'null'] },
        email: { bsonType: ['string', 'null'] },
        service_requested: { bsonType: ['string', 'null'] },
        location: { bsonType: ['string', 'null'] },
        assigned_setter: { bsonType: ['string', 'null'] },
        status: { enum: ['New', 'In Progress', 'Booked', 'Aged', 'DQ'] },
        dq_reason: { bsonType: ['string', 'null'] },
        created_at: { bsonType: 'date' },
        updated_at: { bsonType: 'date' },
        first_contact_at: { bsonType: ['date', 'null'] },
        speed_to_lead_min: {
          bsonType: ['double', 'int', 'long', 'null'],
          minimum: 0
        }
      }
    }
  });

  await applyValidator(leadMetricsCollectionName, {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'lead_id',
        'call_count',
        'sms_count',
        'email_count',
        'showed_up',
        'updated_at'
      ],
      properties: {
        lead_id: { bsonType: 'objectId' },
        call_count: { bsonType: ['int', 'long'], minimum: 0 },
        sms_count: { bsonType: ['int', 'long'], minimum: 0 },
        email_count: { bsonType: ['int', 'long'], minimum: 0 },
        appointment_date: { bsonType: ['date', 'null'] },
        showed_up: { enum: ['Pending', 'Yes', 'No'] },
        updated_at: { bsonType: 'date' }
      }
    }
  });

  const db = await getDatabase();
  await ensureIndex(
    db.collection<SubAccountDocument>(subAccountsCollectionName),
    { ghl_sub_account_id: 1 },
    { unique: true, name: 'uq_sub_accounts_ghl_sub_account_id' }
  );
  await ensureIndex(
    db.collection<LeadDocument>(leadsCollectionName),
    { sub_account_id: 1, phone_number: 1 },
    { unique: true, name: 'uq_leads_sub_account_phone' }
  );
  await ensureIndex(
    db.collection<LeadDocument>(leadsCollectionName),
    { phone_number: 1 },
    { name: 'idx_leads_phone_number' }
  );
  await ensureIndex(
    db.collection<LeadDocument>(leadsCollectionName),
    { status: 1 },
    { name: 'idx_leads_status' }
  );
  await ensureIndex(
    db.collection<LeadDocument>(leadsCollectionName),
    { assigned_setter: 1 },
    { name: 'idx_leads_assigned_setter' }
  );
  await ensureIndex(
    db.collection<LeadMetricDocument>(leadMetricsCollectionName),
    { lead_id: 1 },
    { unique: true, name: 'uq_lead_metrics_lead_id' }
  );
  await ensureIndex(
    db.collection<LeadMetricDocument>(leadMetricsCollectionName),
    { showed_up: 1 },
    { name: 'idx_lead_metrics_showed_up' }
  );
  await ensureIndex(
    db.collection<MakeReportingEventDocument>(makeEventsCollectionName),
    { event_type: 1, received_at: -1 },
    { name: 'idx_make_reporting_events_type_received_at' }
  );
  await ensureIndex(
    db.collection<MakeReportingEventDocument>(makeEventsCollectionName),
    { scenario_name: 1, received_at: -1 },
    { name: 'idx_make_reporting_events_scenario_received_at' }
  );

  initialized = true;
}

export async function getSubAccountsCollection() {
  const db = await getDatabase();
  return db.collection<SubAccountDocument>(subAccountsCollectionName);
}

export async function getLeadsCollection() {
  const db = await getDatabase();
  return db.collection<LeadDocument>(leadsCollectionName);
}

export async function getLeadMetricsCollection() {
  const db = await getDatabase();
  return db.collection<LeadMetricDocument>(leadMetricsCollectionName);
}

export async function getMakeReportingEventsCollection() {
  const db = await getDatabase();
  return db.collection<MakeReportingEventDocument>(makeEventsCollectionName);
}

export async function requireDocument<T extends Document>(
  collection: Collection<T>,
  filter: Parameters<Collection<T>['findOne']>[0],
  message: string
) {
  const document = await collection.findOne(filter);

  if (!document) {
    throw new Error(message);
  }

  return document;
}

export function serializeDocument<T extends { _id: ObjectId }>(document: T) {
  return {
    ...document,
    id: document._id.toHexString(),
    _id: document._id.toHexString()
  };
}

export function serializeNullableDocument<T extends { _id: ObjectId }>(document: T | null) {
  return document ? serializeDocument(document) : null;
}
