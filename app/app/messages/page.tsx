// app/app/messages/page.tsx
import MessagesClient from "./MessagesClient";

export const dynamic = "force-dynamic";

export default function MessagesPage() {
  // IMPORTANT: don't pass null; use undefined (or omit the prop)
  return <MessagesClient initialThreadId={undefined} />;
}
