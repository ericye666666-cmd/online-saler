import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const employee = {
  id: "00000000-0000-4000-8000-000000000001",
  employeeCode: "STAGING-TEST-001",
  name: "Staging Test Operator",
  status: "ACTIVE"
};

try {
  const result = await prisma.employee.upsert({
    where: { employeeCode: employee.employeeCode },
    update: {
      name: employee.name,
      status: employee.status
    },
    create: employee
  });

  console.log(`Staging test employee ready: ${result.id}`);
} finally {
  await prisma.$disconnect();
}
