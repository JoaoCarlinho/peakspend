"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../src/generated/prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("Starting database seeding...");
    // Default categories to seed
    const defaultCategories = [
        { name: "Groceries", color: "#4CAF50", isDefault: true },
        { name: "Transportation", color: "#2196F3", isDefault: true },
        { name: "Utilities", color: "#FF9800", isDefault: true },
        { name: "Entertainment", color: "#9C27B0", isDefault: true },
        { name: "Healthcare", color: "#F44336", isDefault: true },
        { name: "Shopping", color: "#E91E63", isDefault: true },
        { name: "Dining", color: "#FF5722", isDefault: true },
        { name: "Travel", color: "#00BCD4", isDefault: true },
        { name: "Education", color: "#3F51B5", isDefault: true },
        { name: "Other", color: "#9E9E9E", isDefault: true },
    ];
    // Check if default categories already exist
    const existingCategories = await prisma.category.count({
        where: { isDefault: true },
    });
    if (existingCategories > 0) {
        console.log(`Skipping default categories - ${existingCategories} already exist`);
    }
    else {
        // Create default categories (userId is null for system defaults)
        for (const category of defaultCategories) {
            await prisma.category.create({
                data: {
                    ...category,
                    userId: null, // System default categories have no user
                },
            });
            console.log(`Created default category: ${category.name}`);
        }
        console.log(`✓ Created ${defaultCategories.length} default categories successfully`);
    }
    console.log("Database seeding completed!");
}
main()
    .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map