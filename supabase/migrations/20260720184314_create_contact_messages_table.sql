/*
# Create contact_messages table

1. New Tables
- `contact_messages`
  - `id` (uuid, primary key)
  - `name` (text, not null) — sender's name
  - `email` (text, not null) — sender's email
  - `subject` (text) — optional subject line
  - `message` (text, not null) — the message body
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `contact_messages`.
- Allow anon + authenticated INSERT (public contact form).
- No SELECT/UPDATE/DELETE for anon — only service role can read.
*/

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_contact_messages" ON contact_messages;
CREATE POLICY "anon_insert_contact_messages" ON contact_messages FOR INSERT
TO anon, authenticated WITH CHECK (true);
