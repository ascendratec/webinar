-- EventHub Webinar - Aurora Serverless v2 PostgreSQL Schema
-- Engine: Aurora PostgreSQL (compatível com PostgreSQL 15)

-- Tabela de participantes
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_participant_email UNIQUE (email)
);

-- Tabela de inscrições
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    event_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_DOCUMENT',
    document_s3_key VARCHAR(500),
    rejection_reason VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_status CHECK (status IN ('PENDING_DOCUMENT', 'DOCUMENT_UPLOADED', 'APPROVED', 'REJECTED')),
    CONSTRAINT uq_participant_event UNIQUE (participant_id, event_id)
);

-- Índice para busca por evento
CREATE INDEX idx_registrations_event_id ON registrations(event_id);

-- Índice para busca por status
CREATE INDEX idx_registrations_status ON registrations(status);

-- Tabela de audit logs
CREATE TABLE registration_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id),
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca por inscrição
CREATE INDEX idx_audit_logs_registration_id ON registration_audit_logs(registration_id);
