#!/usr/bin/env ts-node
/**
 * Migrate Prompts Script
 *
 * Migrates default system prompts from code to database.
 * Uses upsert to avoid duplicates - safe to run multiple times.
 *
 * Usage:
 *   npm run migrate:prompts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '../../src/generated/prisma';
import { defaultPrompts, PromptDefinition } from './default_prompts';

const prisma = new PrismaClient();

async function migratePrompts(): Promise<void> {
  console.log('Starting prompt migration...\n');
  console.log(`Found ${defaultPrompts.length} prompts to migrate.\n`);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const prompt of defaultPrompts) {
    try {
      // Check if prompt already exists
      const existing = await prisma.systemPrompt.findUnique({
        where: { name: prompt.name },
      });

      if (existing) {
        // Check if content has changed
        if (existing.contentHash !== prompt.contentHash) {
          // Content changed - create new version
          const newVersion = existing.version + 1;

          await prisma.$transaction([
            prisma.systemPrompt.update({
              where: { id: existing.id },
              data: { isActive: false },
            }),
            prisma.systemPrompt.create({
              data: {
                name: prompt.name,
                content: prompt.content,
                contentHash: prompt.contentHash,
                version: newVersion,
                isActive: prompt.isActive,
                createdBy: prompt.createdBy,
              },
            }),
          ]);

          console.log(`  ✓ Updated: ${prompt.name} (v${existing.version} -> v${newVersion})`);
          updated++;
        } else {
          console.log(`  - Skipped: ${prompt.name} (already exists with same content)`);
          skipped++;
        }
      } else {
        // Create new prompt
        await prisma.systemPrompt.create({
          data: {
            name: prompt.name,
            content: prompt.content,
            contentHash: prompt.contentHash,
            version: prompt.version,
            isActive: prompt.isActive,
            createdBy: prompt.createdBy,
          },
        });

        console.log(`  ✓ Created: ${prompt.name} (v${prompt.version})`);
        created++;
      }
    } catch (error) {
      console.error(`  ✗ Error migrating ${prompt.name}:`, error);
      throw error;
    }
  }

  console.log('\n═'.repeat(50));
  console.log('Migration Summary:');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${defaultPrompts.length}`);
  console.log('═'.repeat(50));

  // Create audit log entry
  await prisma.securityEvent.create({
    data: {
      eventType: 'PROMPT_MODIFIED',
      severity: 'INFO',
      details: {
        operation: 'MIGRATE',
        source: 'migrate_prompts.ts',
        created,
        updated,
        skipped,
        total: defaultPrompts.length,
        timestamp: new Date().toISOString(),
      },
      status: 'RESOLVED',
      alertSent: false,
    },
  });

  console.log('\n✓ Migration complete. Audit log entry created.');
}

// Run migration
migratePrompts()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nMigration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
