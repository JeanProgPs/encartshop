-- Migration: create global_config table for Evolution API settings
-- Stores a single row with the URL and API key used by all stores
-- Run with: supabase db push

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS global_config (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    evolution_api_url text,
    evolution_api_key text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Insert a singleton row if the table is empty (optional)
INSERT INTO global_config (evolution_api_url, evolution_api_key)
SELECT NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM global_config);
