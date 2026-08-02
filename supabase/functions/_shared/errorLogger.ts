// Shared helper: logs an Edge Function error into `function_errors` so
// it's visible in Super Admin > Monitoring -- free, no external service.
// Import this in any function's catch block for critical operations
// (payments especially: a silent failure there means a client paid but
// was never activated, or vice versa).
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

export async function logFunctionError(
  functionName: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  try {
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const message = error instanceof Error ? error.message : String(error);
    await serviceClient.from("function_errors").insert({
      function_name: functionName,
      tenant_id: (context.tenant_id as string) ?? null,
      message: message.slice(0, 2000),
      context,
    });
  } catch {
    // Never let error logging itself throw -- the original error is
    // already being returned to the caller regardless.
  }
}
