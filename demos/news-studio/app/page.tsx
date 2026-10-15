import { Broadcast } from "@/components/Broadcast";
import { IdleStopBridge } from "@/components/IdleStopBridge";

export const dynamic = "force-dynamic";

export default function Page() {
  const missing = [!process.env.REACTOR_API_KEY && "REACTOR_API_KEY", !process.env.GEMINI_API_KEY && "GEMINI_API_KEY"].filter(Boolean);
  if (missing.length) return (
    <main style={{ padding: "48px", maxWidth: "760px", margin: "auto", lineHeight: 1.7 }}>
      <IdleStopBridge />
      <p>R24 / NEWS STUDIO</p>
      <h1>Your newsroom is almost ready.</h1>
      <p>Add {missing.join(" and ")} to <code>news-studio/.env.local</code>, then restart the News Studio server.</p>
      <p>These keys stay on the server. Redis is optional for this local demo. No paid session starts until you click Start.</p>
    </main>
  );
  return <Broadcast />;
}
