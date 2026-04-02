import UsageStats from "@/components/UsageStats";

export default function Home() {
  // In a real app, userId would come from the authenticated session.
  // For demo purposes, user ID 1 is used (created by the seed script).
  const demoUserId = 1;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <UsageStats userId={demoUserId} initialDays={7} />
    </main>
  );
}
