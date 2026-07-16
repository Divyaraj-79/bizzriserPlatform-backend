const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const orgId = "org_123";
    
    // Create dummy organization
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: "Test Org", email: "test@test.com", passwordHash: "123", firstName: "test", lastName: "test", slug: "test-org-123" }
    });
    
    await prisma.metaCatalog.upsert({
      where: { id: "cat_123" },
      update: {},
      create: { id: "cat_123", organizationId: orgId, metaCatalogId: "meta_cat_123", name: "Test Catalog" }
    });

    await prisma.metaProduct.upsert({
      where: {
        organizationId_metaCatalogId_retailerId: {
          organizationId: orgId,
          metaCatalogId: "meta_cat_123",
          retailerId: "ret_123"
        }
      },
      update: {
        name: "Test"
      },
      create: {
        organizationId: orgId,
        metaCatalogId: "meta_cat_123",
        retailerId: "ret_123",
        name: "Test"
      }
    });
    console.log("Upsert succeeded!");
  } catch (e) {
    console.error("Prisma error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
