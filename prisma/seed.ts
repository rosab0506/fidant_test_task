import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create a test user
  const user = await prisma.users.upsert({
    where: { email: "demo@fidant.ai" },
    update: {},
    create: {
      email: "demo@fidant.ai",
      name: "Demo User",
      plan_tier: "starter",
    },
  });

  console.log("Seeded user:", user);

  // Seed 7 days of usage events
  const today = new Date();
  const events = [];

  for (let d = 0; d < 7; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateKey = date.toISOString().slice(0, 10);
    const count = Math.floor(Math.random() * 20) + 1;

    for (let i = 0; i < count; i++) {
      events.push({
        user_id: user.id,
        date_key: dateKey,
        request_id: `req-${dateKey}-${i}`,
        status: "committed" as const,
        committed_at: date,
      });
    }

    // Add a couple of reserved (active) events for today
    if (d === 0) {
      for (let i = 0; i < 2; i++) {
        events.push({
          user_id: user.id,
          date_key: dateKey,
          request_id: `req-reserved-${i}`,
          status: "reserved" as const,
          committed_at: null,
        });
      }
    }
  }

  await prisma.daily_usage_events.createMany({ data: events });
  console.log(`Seeded ${events.length} events`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
