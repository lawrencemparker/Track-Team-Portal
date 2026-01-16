import { supabaseServer } from "@/lib/supabase/server";
import MessagesClient from "../../MessagesClient";

export default function Page({ params }: { params: { threadId: string } }) {
  const threadId = params.threadId;
  return <MessagesClient initialThreadId={threadId} />;
}


export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="glass rounded-3xl p-6">
          <h1 className="text-xl font-semibold">Session required</h1>
          <p className="mt-2 text-white/70">Please sign in again.</p>
          <a
            className="mt-4 inline-flex rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
            href="/login"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  const { threadId } = await params;
  return <MessagesClient initialThreadId={threadId} />;
}
