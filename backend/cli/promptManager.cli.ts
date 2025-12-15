#!/usr/bin/env ts-node
/**
 * Prompt Manager CLI Tool
 *
 * Administrative command-line interface for managing system prompts.
 * Prompts are stored in the database with hash-based integrity verification.
 *
 * WARNING: Requires ADMIN_API_KEY environment variable for authentication.
 *
 * Usage:
 *   ADMIN_API_KEY=secret npm run prompt:list
 *   ADMIN_API_KEY=secret npm run prompt:add receipt_ocr ./prompts/receipt_ocr.txt
 *   ADMIN_API_KEY=secret npm run prompt:update receipt_ocr ./prompts/receipt_ocr_v2.txt
 *   ADMIN_API_KEY=secret npm run prompt:verify
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '../src/generated/prisma';
import { computePromptHash, verifyAllPrompts } from '../src/llm/prompts/promptValidator.service';

const prisma = new PrismaClient();
const program = new Command();

/**
 * Check for admin authentication
 * Requires ADMIN_API_KEY environment variable or --key flag
 */
function requireAuth(options: { key?: string }): void {
  const adminKey = options.key || process.env['ADMIN_API_KEY'];

  if (!adminKey) {
    console.error('Error: Authentication required.');
    console.error('Set ADMIN_API_KEY environment variable or use --key flag.');
    process.exit(1);
  }

  // In production, validate against stored admin key
  // For now, just check that a key was provided
  if (adminKey.length < 8) {
    console.error('Error: Invalid admin key (minimum 8 characters).');
    process.exit(1);
  }
}

/**
 * Log an audit event for prompt operations
 */
async function logAuditEvent(
  operation: 'LIST' | 'ADD' | 'UPDATE' | 'VERIFY',
  promptName: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: 'PROMPT_MODIFIED',
        severity: operation === 'ADD' || operation === 'UPDATE' ? 'INFO' : 'LOW',
        details: {
          operation,
          promptName,
          adminUser: 'cli-admin',
          timestamp: new Date().toISOString(),
          ...details,
        },
        status: 'RESOLVED', // Audit logs are resolved by definition
        alertSent: false,
      },
    });
  } catch (error) {
    console.warn('Warning: Failed to create audit log entry', error);
  }
}

// Configure CLI program
program
  .name('prompt-manager')
  .description('CLI tool for managing system prompts in PeakSpend')
  .version('1.0.0')
  .option('-k, --key <key>', 'Admin API key (alternative to ADMIN_API_KEY env var)');

/**
 * List command - displays all prompts
 */
program
  .command('list')
  .description('List all system prompts')
  .option('-a, --all', 'Include inactive prompts')
  .action(async (options: { all?: boolean }, command: Command) => {
    const parentOpts = command.parent?.opts() as { key?: string };
    requireAuth(parentOpts);

    try {
      const prompts = await prisma.systemPrompt.findMany({
        where: options.all ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      });

      if (prompts.length === 0) {
        console.log('No prompts found.');
        return;
      }

      console.log('\nSystem Prompts:');
      console.log('═'.repeat(80));
      console.table(
        prompts.map((p) => ({
          Name: p.name,
          Version: p.version,
          Active: p.isActive ? '✓' : '✗',
          'Content Length': p.content.length,
          'Created At': p.createdAt.toISOString().split('T')[0],
        }))
      );

      await logAuditEvent('LIST', null, { count: prompts.length, includeInactive: options.all });
    } catch (error) {
      console.error('Error listing prompts:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * Add command - creates a new prompt from file
 */
program
  .command('add <name> <file>')
  .description('Add a new prompt from file')
  .action(async (name: string, file: string, _options: Record<string, unknown>, command: Command) => {
    const parentOpts = command.parent?.opts() as { key?: string };
    requireAuth(parentOpts);

    try {
      // Check if prompt already exists
      const existing = await prisma.systemPrompt.findUnique({
        where: { name },
      });

      if (existing) {
        console.error(`Error: Prompt "${name}" already exists.`);
        console.error('Use "update" command to create a new version.');
        process.exit(1);
      }

      // Read file content
      const filePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content.length === 0) {
        console.error('Error: File is empty.');
        process.exit(1);
      }

      // Compute hash
      const contentHash = computePromptHash(content);

      // Create prompt
      const prompt = await prisma.systemPrompt.create({
        data: {
          name,
          content,
          contentHash,
          version: 1,
          isActive: true,
          createdBy: 'cli-admin',
        },
      });

      console.log('\n✓ Prompt created successfully');
      console.log(`  Name: ${prompt.name}`);
      console.log(`  Version: ${prompt.version}`);
      console.log(`  Content Length: ${content.length} characters`);
      console.log(`  Hash: ${contentHash}`);

      await logAuditEvent('ADD', name, {
        version: 1,
        contentLength: content.length,
        contentHash,
      });
    } catch (error) {
      console.error('Error adding prompt:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * Update command - creates a new version of an existing prompt
 */
program
  .command('update <name> <file>')
  .description('Update prompt (creates new version)')
  .action(async (name: string, file: string, _options: Record<string, unknown>, command: Command) => {
    const parentOpts = command.parent?.opts() as { key?: string };
    requireAuth(parentOpts);

    try {
      // Find existing prompt
      const existing = await prisma.systemPrompt.findFirst({
        where: { name, isActive: true },
      });

      if (!existing) {
        console.error(`Error: Active prompt "${name}" not found.`);
        console.error('Use "add" command to create a new prompt.');
        process.exit(1);
      }

      // Read file content
      const filePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content.length === 0) {
        console.error('Error: File is empty.');
        process.exit(1);
      }

      // Check if content is the same
      const contentHash = computePromptHash(content);
      if (contentHash === existing.contentHash) {
        console.log('No changes detected. Prompt content is identical.');
        return;
      }

      const newVersion = existing.version + 1;

      // Transaction: deactivate old, create new
      await prisma.$transaction([
        prisma.systemPrompt.update({
          where: { id: existing.id },
          data: { isActive: false },
        }),
        prisma.systemPrompt.create({
          data: {
            name,
            content,
            contentHash,
            version: newVersion,
            isActive: true,
            createdBy: 'cli-admin',
          },
        }),
      ]);

      console.log('\n✓ Prompt updated successfully');
      console.log(`  Name: ${name}`);
      console.log(`  Previous Version: ${existing.version} (now inactive)`);
      console.log(`  New Version: ${newVersion}`);
      console.log(`  Content Length: ${content.length} characters`);
      console.log(`  New Hash: ${contentHash}`);

      await logAuditEvent('UPDATE', name, {
        previousVersion: existing.version,
        newVersion,
        contentLength: content.length,
        contentHash,
      });
    } catch (error) {
      console.error('Error updating prompt:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * Verify command - checks integrity of all prompts
 */
program
  .command('verify')
  .description('Verify integrity of all prompt hashes')
  .action(async (_options: Record<string, unknown>, command: Command) => {
    const parentOpts = command.parent?.opts() as { key?: string };
    requireAuth(parentOpts);

    try {
      const prompts = await prisma.systemPrompt.findMany({
        where: { isActive: true },
      });

      if (prompts.length === 0) {
        console.log('No active prompts to verify.');
        return;
      }

      console.log(`\nVerifying ${prompts.length} prompts...`);
      console.log('═'.repeat(60));

      const result = verifyAllPrompts(prompts);

      if (result.valid) {
        console.log('\n✓ All prompts passed integrity verification');
        console.log(`  Total checked: ${result.totalChecked}`);
        console.log(`  All hashes matched`);
      } else {
        console.error('\n✗ INTEGRITY CHECK FAILED');
        console.error(`  Total checked: ${result.totalChecked}`);
        console.error(`  Passed: ${result.passed}`);
        console.error(`  Failed: ${result.failed}`);
        console.error('\n  Failed prompts:');

        for (const failure of result.failures) {
          console.error(`    - ${failure.promptName}`);
          console.error(`      Expected: ${failure.expectedHash}`);
          console.error(`      Actual:   ${failure.actualHash}`);
        }

        // Create security events for failures
        for (const failure of result.failures) {
          await prisma.securityEvent.create({
            data: {
              eventType: 'PROMPT_INTEGRITY_FAILURE',
              severity: 'CRITICAL',
              details: {
                promptName: failure.promptName,
                expectedHash: failure.expectedHash,
                source: 'cli-verify',
              },
              status: 'PENDING',
              alertSent: false,
              alertDestinations: ['security-team'],
            },
          });
        }

        process.exit(1);
      }

      await logAuditEvent('VERIFY', null, {
        totalChecked: result.totalChecked,
        passed: result.passed,
        failed: result.failed,
      });
    } catch (error) {
      console.error('Error verifying prompts:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * Show command - displays a single prompt's content
 */
program
  .command('show <name>')
  .description('Display prompt content')
  .action(async (name: string, _options: Record<string, unknown>, command: Command) => {
    const parentOpts = command.parent?.opts() as { key?: string };
    requireAuth(parentOpts);

    try {
      const prompt = await prisma.systemPrompt.findFirst({
        where: { name, isActive: true },
      });

      if (!prompt) {
        console.error(`Error: Active prompt "${name}" not found.`);
        process.exit(1);
      }

      console.log(`\nPrompt: ${prompt.name} (v${prompt.version})`);
      console.log('═'.repeat(60));
      console.log(prompt.content);
      console.log('═'.repeat(60));
      console.log(`Hash: ${prompt.contentHash}`);
      console.log(`Created: ${prompt.createdAt.toISOString()}`);
    } catch (error) {
      console.error('Error showing prompt:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

/**
 * Delete command - deactivates a prompt
 */
program
  .command('delete <name>')
  .description('Deactivate a prompt (soft delete)')
  .option('-f, --force', 'Skip confirmation')
  .action(async (name: string, options: { force?: boolean }, command: Command) => {
    const parentOpts = command.parent?.opts() as { key?: string };
    requireAuth(parentOpts);

    try {
      const prompt = await prisma.systemPrompt.findFirst({
        where: { name, isActive: true },
      });

      if (!prompt) {
        console.error(`Error: Active prompt "${name}" not found.`);
        process.exit(1);
      }

      if (!options.force) {
        console.log(`\nAbout to deactivate prompt: ${name} (v${prompt.version})`);
        console.log('Use --force flag to confirm.');
        process.exit(0);
      }

      await prisma.systemPrompt.update({
        where: { id: prompt.id },
        data: { isActive: false },
      });

      console.log(`\n✓ Prompt "${name}" has been deactivated.`);

      await logAuditEvent('UPDATE', name, {
        action: 'deactivate',
        version: prompt.version,
      });
    } catch (error) {
      console.error('Error deleting prompt:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Parse command line arguments
program.parse();
