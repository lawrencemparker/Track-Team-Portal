// app/app/messages/[threadId]/page.tsx
import MessagesClient from "../MessagesClient";

export const dynamic = "force-dynamic";

export default function MessageThreadPage({
  params,
}: {
  params: { threadId: string };
}) {
  return <MessagesClient initialThreadId={params.threadId} />;
}
