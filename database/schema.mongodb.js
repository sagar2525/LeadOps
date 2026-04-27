// MongoDB bootstrap script for the HOM reporting database.
// Run with mongosh against the target database:
//   mongosh "mongodb://127.0.0.1:27017/hom_reporting" database/schema.mongodb.js

const hasCollection = (name) =>
  db.getCollectionInfos({ name }).length > 0;

const ensureCollection = (name) => {
  if (!hasCollection(name)) {
    db.createCollection(name);
  }
};

const applyValidator = (name, validator) => {
  const result = db.runCommand({
    collMod: name,
    validator,
    validationLevel: 'strict',
    validationAction: 'error'
  });

  if (!result.ok) {
    throw new Error(`Failed to apply validator to ${name}: ${tojson(result)}`);
  }
};

ensureCollection('sub_accounts');
ensureCollection('leads');
ensureCollection('lead_metrics');

applyValidator('sub_accounts', {
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

applyValidator('leads', {
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

applyValidator('lead_metrics', {
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

db.sub_accounts.createIndex(
  { ghl_sub_account_id: 1 },
  { unique: true, name: 'uq_sub_accounts_ghl_sub_account_id' }
);

db.leads.createIndex(
  { sub_account_id: 1, phone_number: 1 },
  { unique: true, name: 'uq_leads_sub_account_phone' }
);

db.leads.createIndex({ phone_number: 1 }, { name: 'idx_leads_phone_number' });
db.leads.createIndex({ status: 1 }, { name: 'idx_leads_status' });
db.leads.createIndex({ assigned_setter: 1 }, { name: 'idx_leads_assigned_setter' });

db.lead_metrics.createIndex(
  { lead_id: 1 },
  { unique: true, name: 'uq_lead_metrics_lead_id' }
);

db.lead_metrics.createIndex({ showed_up: 1 }, { name: 'idx_lead_metrics_showed_up' });
