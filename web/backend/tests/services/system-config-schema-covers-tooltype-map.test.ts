/**
 * A field the API maps to a tooltype must survive its own schema.
 *
 * SystemConfigSchema is a plain `z.object`, so `.partial().parse()` DROPS a
 * key it does not declare and reports success. Six fields were mapped in
 * TOOLTYPE_MAP, served by the API, and absent from the schema - two of them
 * with a visible form field and a <TooltypeKey> badge naming the very key
 * they claimed to write. The sysop typed a value, the toast said saved, and
 * the writer never saw it.
 *
 * The existing round-trip contract cannot see this class: safeParse on an
 * unknown key succeeds. So the guard has to compare KEY SETS, not values.
 */

process.env.SKIP_DB_INIT = '1';

import { SystemConfigSchema } from '../../src/services/config.schemas';
import { getConfigTooltypeKeys } from '../../src/services/bbs-config-file.service';
import { isSensitiveField, isDatabaseOnlyField } from '../../src/utils/secrets-encryption.util';

describe('SystemConfigSchema covers every mapped tooltype', () => {
  const mapped = Object.keys(getConfigTooltypeKeys());
  const declared = new Set(Object.keys(SystemConfigSchema.shape));

  it('declares a key for every field with a tooltype', () => {
    const missing = mapped.filter(field => !declared.has(field));
    expect(missing).toEqual([]);
  });

  it.each(mapped)('keeps %s in the parsed output rather than stripping it', field => {
    // The value's type has to match, or zod rejects rather than strips - which
    // is a different (and visible) failure. Take it from the schema itself.
    const shape = (SystemConfigSchema.shape as Record<string, { _def: unknown }>)[field];
    const sample = sampleFor(shape);

    const parsed = SystemConfigSchema.partial().safeParse({ [field]: sample });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data)).toContain(field);
    }
  });
});

describe('a password POLICY field is not filed as a secret', () => {
  // "password" in the name routed six rules-about-passwords into the
  // encrypted database while the BBS read the disk. system_password is the
  // opposite case: a real password that STILL has to live on disk, because
  // ACP.e:2630 is where the local console gate reads it from.
  it.each([
    'min_password_length',
    'min_password_strength',
    'max_password_fails',
    'password_expiry_days',
    'password_security',
    'strict_password_policy',
    'system_password',
  ])('%s stays on disk', field => {
    expect(isSensitiveField(field)).toBe(false);
    expect(isDatabaseOnlyField(field)).toBe(false);
  });
});

/** A value the schema will accept for this field, derived from its own type. */
function sampleFor(shape: unknown): unknown {
  const walk = (def: any): unknown => {
    const name = def?._def?.typeName;
    switch (name) {
      case 'ZodOptional':
      case 'ZodNullable':
        return walk(def._def.innerType);
      case 'ZodDefault':
        return walk(def._def.innerType);
      case 'ZodEffects':
        return walk(def._def.schema);
      case 'ZodPipeline':
        // The OUT side is the real constraint - `.transform().pipe(z.enum())`
        // accepts only what the enum lists, whatever the string half allows.
        return walk(def._def.out);
      case 'ZodUnion':
        return walk(def._def.options[0]);
      case 'ZodEnum':
        return def._def.values[0];
      case 'ZodBoolean':
        return true;
      case 'ZodNumber': {
        const checks = def._def.checks ?? [];
        const min = checks.find((c: { kind: string }) => c.kind === 'min')?.value;
        return typeof min === 'number' ? min : 1;
      }
      case 'ZodString': {
        const checks = def._def.checks ?? [];
        if (checks.some((c: { kind: string }) => c.kind === 'email')) return 'a@b.com';
        if (checks.some((c: { kind: string }) => c.kind === 'url')) return 'https://example.com';
        const min = checks.find((c: { kind: string }) => c.kind === 'min')?.value ?? 0;
        return 'x'.repeat(Math.max(min, 1));
      }
      default:
        return 'x';
    }
  };
  return walk(shape);
}
