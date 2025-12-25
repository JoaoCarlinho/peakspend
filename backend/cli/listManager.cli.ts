#!/usr/bin/env ts-node
/**
 * List Manager CLI Tool
 *
 * Administrative command-line interface for managing allow/block lists.
 * Lists are stored in YAML configuration file.
 *
 * Usage:
 *   npm run lists:show
 *   npm run lists:add allow "pattern" "reason" [--regex]
 *   npm run lists:add block "pattern" "reason" [--regex]
 *   npm run lists:remove <id>
 *   npm run lists:test "input text"
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

// Configuration file path
const CONFIG_PATH = path.join(__dirname, '../config/allow-block-lists.yaml');

// Zod schemas for validation
const ListEntrySchema = z.object({
  id: z.string(),
  pattern: z.string(),
  type: z.enum(['exact', 'regex']),
  reason: z.string(),
  added_by: z.string(),
  added_at: z.string(),
});

const ListConfigSchema = z.object({
  version: z.string(),
  description: z.string(),
  allow_list: z.array(ListEntrySchema),
  block_list: z.array(ListEntrySchema),
});

type ListConfig = z.infer<typeof ListConfigSchema>;
type ListEntry = z.infer<typeof ListEntrySchema>;

/**
 * Load configuration from YAML file
 */
function loadConfig(): ListConfig {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const rawConfig = yaml.load(content);
    return ListConfigSchema.parse(rawConfig);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Return default config if file doesn't exist
      return {
        version: '1.0',
        description: 'Allow and block lists for input inspection',
        allow_list: [],
        block_list: [],
      };
    }
    throw error;
  }
}

/**
 * Save configuration to YAML file
 */
function saveConfig(config: ListConfig): void {
  const content = yaml.dump(config, {
    noRefs: true,
    lineWidth: -1,
    quotingType: '"',
  });
  fs.writeFileSync(CONFIG_PATH, content, 'utf-8');
}

/**
 * Generate next ID for a list type
 */
function generateId(config: ListConfig, listType: 'allow' | 'block'): string {
  const prefix = listType.toUpperCase();
  const list = listType === 'allow' ? config.allow_list : config.block_list;
  const maxNum = list.reduce((max, entry) => {
    const match = entry.id.match(/^(ALLOW|BLOCK)(\d+)$/);
    if (match) {
      const num = parseInt(match[2], 10);
      return Math.max(max, num);
    }
    return max;
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * Match an entry against input
 */
function matchEntry(input: string, entry: ListEntry): boolean {
  const lowerInput = input.toLowerCase();

  if (entry.type === 'exact') {
    return lowerInput.includes(entry.pattern.toLowerCase());
  } else if (entry.type === 'regex') {
    try {
      const regex = new RegExp(entry.pattern, 'i');
      return regex.test(input);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Test input against lists
 */
function testInput(
  input: string,
  config: ListConfig
): {
  match: boolean;
  listType?: 'allow' | 'block';
  listId?: string;
  reason?: string;
  decision?: 'ALLOW' | 'BLOCK';
} {
  // Check allow list first
  for (const entry of config.allow_list) {
    if (matchEntry(input, entry)) {
      return {
        match: true,
        listType: 'allow',
        listId: entry.id,
        reason: entry.reason,
        decision: 'ALLOW',
      };
    }
  }

  // Check block list second
  for (const entry of config.block_list) {
    if (matchEntry(input, entry)) {
      return {
        match: true,
        listType: 'block',
        listId: entry.id,
        reason: entry.reason,
        decision: 'BLOCK',
      };
    }
  }

  return { match: false };
}

// Create CLI program
const program = new Command();

program
  .name('list-manager')
  .description('CLI tool for managing allow/block lists in PeakSpend')
  .version('1.0.0');

/**
 * Show command - displays all list entries
 */
program
  .command('show')
  .description('Display all list entries')
  .option('-t, --type <type>', 'Filter by list type (allow/block)')
  .action((options: { type?: string }) => {
    const config = loadConfig();

    const showAllow = !options.type || options.type === 'allow';
    const showBlock = !options.type || options.type === 'block';

    if (showAllow) {
      console.log('\n=== ALLOW LIST ===');
      console.log(`Total entries: ${config.allow_list.length}\n`);

      if (config.allow_list.length === 0) {
        console.log('  (no entries)');
      } else {
        config.allow_list.forEach((entry) => {
          console.log(`  [${entry.id}] (${entry.type})`);
          console.log(`    Pattern: ${entry.pattern}`);
          console.log(`    Reason:  ${entry.reason}`);
          console.log(`    Added:   ${entry.added_at} by ${entry.added_by}`);
          console.log();
        });
      }
    }

    if (showBlock) {
      console.log('\n=== BLOCK LIST ===');
      console.log(`Total entries: ${config.block_list.length}\n`);

      if (config.block_list.length === 0) {
        console.log('  (no entries)');
      } else {
        config.block_list.forEach((entry) => {
          console.log(`  [${entry.id}] (${entry.type})`);
          console.log(`    Pattern: ${entry.pattern}`);
          console.log(`    Reason:  ${entry.reason}`);
          console.log(`    Added:   ${entry.added_at} by ${entry.added_by}`);
          console.log();
        });
      }
    }
  });

/**
 * Add command - adds an entry to allow or block list
 */
program
  .command('add <type> <pattern> <reason>')
  .description('Add entry to allow or block list')
  .option('-r, --regex', 'Pattern is regex (default: exact)')
  .action((type: string, pattern: string, reason: string, options: { regex?: boolean }) => {
    // Validate type
    if (type !== 'allow' && type !== 'block') {
      console.error('Error: Type must be "allow" or "block"');
      process.exit(1);
    }

    // Validate regex if specified
    if (options.regex) {
      try {
        new RegExp(pattern);
      } catch (e) {
        console.error(`Error: Invalid regex pattern: ${pattern}`);
        console.error((e as Error).message);
        process.exit(1);
      }
    }

    const config = loadConfig();
    const id = generateId(config, type as 'allow' | 'block');

    const entry: ListEntry = {
      id,
      pattern,
      type: options.regex ? 'regex' : 'exact',
      reason,
      added_by: process.env['USER'] || 'admin',
      added_at: new Date().toISOString().split('T')[0],
    };

    if (type === 'allow') {
      config.allow_list.push(entry);
    } else {
      config.block_list.push(entry);
    }

    saveConfig(config);
    console.log(`\nAdded ${type} entry: ${id}`);
    console.log(`  Pattern: ${entry.pattern} (${entry.type})`);
    console.log(`  Reason:  ${entry.reason}`);
  });

/**
 * Remove command - removes an entry by ID
 */
program
  .command('remove <id>')
  .description('Remove entry by ID')
  .action((id: string) => {
    const config = loadConfig();
    const upperID = id.toUpperCase();

    // Try to find in allow list
    const allowIndex = config.allow_list.findIndex((e) => e.id.toUpperCase() === upperID);
    if (allowIndex >= 0) {
      const removed = config.allow_list.splice(allowIndex, 1)[0];
      saveConfig(config);
      console.log(`\nRemoved allow entry: ${removed.id}`);
      console.log(`  Pattern: ${removed.pattern}`);
      console.log(`  Reason:  ${removed.reason}`);
      return;
    }

    // Try to find in block list
    const blockIndex = config.block_list.findIndex((e) => e.id.toUpperCase() === upperID);
    if (blockIndex >= 0) {
      const removed = config.block_list.splice(blockIndex, 1)[0];
      saveConfig(config);
      console.log(`\nRemoved block entry: ${removed.id}`);
      console.log(`  Pattern: ${removed.pattern}`);
      console.log(`  Reason:  ${removed.reason}`);
      return;
    }

    console.error(`Error: Entry with ID "${id}" not found`);
    process.exit(1);
  });

/**
 * Test command - tests input against lists
 */
program
  .command('test <input>')
  .description('Test input against lists')
  .action((input: string) => {
    const config = loadConfig();
    const result = testInput(input, config);

    console.log('\n=== TEST RESULT ===');
    console.log(`Input: "${input.substring(0, 80)}${input.length > 80 ? '...' : ''}"`);
    console.log();

    if (result.match) {
      console.log(`Match: YES`);
      console.log(`List:  ${result.listType}`);
      console.log(`ID:    ${result.listId}`);
      console.log(`Decision: ${result.decision}`);
      console.log(`Reason: ${result.reason}`);
    } else {
      console.log(`Match: NO`);
      console.log(`Decision: Input would proceed to pattern matching and anomaly scoring`);
    }
  });

/**
 * Stats command - shows statistics
 */
program
  .command('stats')
  .description('Show list statistics')
  .action(() => {
    const config = loadConfig();

    console.log('\n=== LIST STATISTICS ===');
    console.log(`Version: ${config.version}`);
    console.log(`Allow list entries: ${config.allow_list.length}`);
    console.log(`Block list entries: ${config.block_list.length}`);
    console.log(`Total entries: ${config.allow_list.length + config.block_list.length}`);

    // Count by type
    const allowExact = config.allow_list.filter((e) => e.type === 'exact').length;
    const allowRegex = config.allow_list.filter((e) => e.type === 'regex').length;
    const blockExact = config.block_list.filter((e) => e.type === 'exact').length;
    const blockRegex = config.block_list.filter((e) => e.type === 'regex').length;

    console.log(`\nAllow patterns: ${allowExact} exact, ${allowRegex} regex`);
    console.log(`Block patterns: ${blockExact} exact, ${blockRegex} regex`);
  });

// Parse arguments and run
program.parse(process.argv);
