# EventHub — Database Guide

## DynamoDB: Events Catalog

### Table Design

- **Table name:** `{StackName}-EventsCatalog`
- **Billing:** PAY_PER_REQUEST (on-demand)
- **Encryption:** SSE enabled
- **PITR:** Enabled

### Key Schema

| Attribute | Type | Role |
|-----------|------|------|
| pk | String | Partition key (value = eventId UUID) |

### Item Structure

```json
{
  "pk": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "AWS Summit 2026",
  "description": "Annual cloud conference...",
  "date": "2026-07-15T09:00:00Z",
  "location": "São Paulo Convention Center",
  "capacity": 500,
  "availableSlots": 498,
  "status": "ACTIVE"
}
```

### Access Patterns

| Pattern | Operation |
|---------|-----------|
| List active events | Scan with filter `status = ACTIVE` |
| Get event by ID | GetItem (pk = eventId) |
| Create event | PutItem |
| Delete event | DeleteItem (pk = eventId) |
| Decrement slots | UpdateItem with ConditionExpression `availableSlots > 0` |

---

## Aurora Serverless v2: Registrations

### Connection Details

- **Engine:** Aurora PostgreSQL 16.4
- **Instance:** db.serverless (0.5–2 ACU)
- **Database:** postgres
- **User:** eventhubadmin
- **Password:** Managed via Secrets Manager (auto-rotation)
- **SSL:** Required (`PG_SSL=true`)
- **Access:** VPC-only (private subnets)

### Schema

```sql
-- participants
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_participant_email UNIQUE (email)
);

-- registrations
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    event_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_DOCUMENT',
    document_s3_key VARCHAR(500),
    rejection_reason VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_status CHECK (
      status IN ('PENDING_DOCUMENT', 'DOCUMENT_UPLOADED', 'APPROVED', 'REJECTED')
    ),
    CONSTRAINT uq_participant_event UNIQUE (participant_id, event_id)
);

-- registration_audit_logs
CREATE TABLE registration_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id),
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Indexes

| Index | Table | Column(s) | Purpose |
|-------|-------|-----------|---------|
| idx_registrations_event_id | registrations | event_id | Filter registrations by event |
| idx_registrations_status | registrations | status | Filter by status |
| idx_audit_logs_registration_id | registration_audit_logs | registration_id | Audit trail lookup |

### State Machine

```
PENDING_DOCUMENT → DOCUMENT_UPLOADED → APPROVED
                                     → REJECTED
```

### Transaction Pattern

Registration creation uses a single PostgreSQL transaction (ACID):
1. INSERT INTO participants (ON CONFLICT DO NOTHING for existing email)
2. INSERT INTO registrations
3. Both succeed or both roll back (10s statement timeout)

After Aurora commit, DynamoDB `availableSlots` is decremented with a conditional expression. If that fails, a compensation deletes the Aurora registration.
