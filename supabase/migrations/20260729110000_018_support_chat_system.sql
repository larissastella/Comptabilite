/*
# Support chat system (AI + human escalation)

## What this adds
- `support_conversations` -- one row per chat session. Works for both
  anonymous landing-page visitors (tenant_id/user_id NULL, identified by
  a browser-generated visitor_id) and logged-in app users.
- `support_messages` -- the message history within a conversation.
- Status flow: 'ai' (bot is handling it) -> 'escalated' (human requested
  or AI couldn't help) -> 'resolved'.

## Isolation
A logged-in user can only see their own tenant's conversations. An
anonymous visitor can only see the one conversation matching their
visitor_id (passed by the client, verified against what's stored -- not
a security boundary in itself since anyone can generate a visitor_id,
but these are pre-sale support chats with no sensitive data, same trust
level as the public contact form). Staff/super admins see everything so
they can pick up escalated conversations.
*/

CREATE TABLE IF NOT EXISTS support_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id    text, -- for anonymous landing-page visitors, client-generated UUID
  visitor_name  text,
  visitor_email text,
  language      text NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  status        text NOT NULL DEFAULT 'ai' CHECK (status IN ('ai', 'escalated', 'resolved')),
  assigned_staff_id uuid REFERENCES auth.users(id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (tenant_id IS NOT NULL OR user_id IS NOT NULL OR visitor_id IS NOT NULL)
);

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sc_tenant ON support_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sc_user ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_sc_visitor ON support_conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sc_status ON support_conversations(status) WHERE status = 'escalated';

DROP POLICY IF EXISTS "sc_select" ON support_conversations;
CREATE POLICY "sc_select" ON support_conversations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND is_tenant_member(tenant_id))
    OR is_super_admin()
    OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid())
  );
-- Anonymous (pre-signup) visitors can also read their own conversation by
-- visitor_id via the anon key -- handled through the edge function using
-- the service role, not direct client queries, so no anon SELECT policy
-- is needed here.
DROP POLICY IF EXISTS "sc_update_staff" ON support_conversations;
CREATE POLICY "sc_update_staff" ON support_conversations FOR UPDATE TO authenticated
  USING (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()))
  WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender          text NOT NULL CHECK (sender IN ('visitor', 'ai', 'staff')),
  staff_id        uuid REFERENCES auth.users(id),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sm_conversation ON support_messages(conversation_id, created_at);

DROP POLICY IF EXISTS "sm_select" ON support_messages;
CREATE POLICY "sm_select" ON support_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_conversations sc WHERE sc.id = support_messages.conversation_id
      AND (sc.user_id = auth.uid() OR (sc.tenant_id IS NOT NULL AND is_tenant_member(sc.tenant_id)) OR is_super_admin()
           OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "sm_insert_staff" ON support_messages;
CREATE POLICY "sm_insert_staff" ON support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender = 'staff' AND staff_id = auth.uid()
    AND (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid()))
  );
-- 'visitor' and 'ai' messages are only ever written by the support-chat
-- edge function via the service role (so a client can't fake an "ai"
-- message, and anonymous visitors -- who have no authenticated session
-- at all -- can still send messages through the function).

-- Lets staff claim/resolve a conversation from the Super Admin dashboard.
CREATE OR REPLACE FUNCTION escalate_conversation_to_staff(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR EXISTS (SELECT 1 FROM internal_staff_users WHERE user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE support_conversations SET assigned_staff_id = auth.uid(), status = 'escalated' WHERE id = p_conversation_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION escalate_conversation_to_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION escalate_conversation_to_staff(uuid) TO authenticated;
