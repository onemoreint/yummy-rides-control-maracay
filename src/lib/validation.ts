import { z } from 'zod';

/** Normaliza teléfonos: conserva "+" inicial y dígitos. No asume longitud fija. */
export function normalizePhone(v: string) {
  const t = v.trim();
  const plus = t.startsWith('+');
  const digits = t.replace(/[^0-9]/g, '');
  return (plus ? '+' : '') + digits;
}

const phoneRegex = /^\+?[0-9]{7,15}$/;

export const phoneRequired = z
  .string()
  .trim()
  .min(1, 'Indique un número telefónico')
  .transform(normalizePhone)
  .refine((v) => phoneRegex.test(v), 'Número inválido: entre 7 y 15 dígitos (puede iniciar con +)');

export const phoneOptional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? normalizePhone(v) : ''))
  .refine((v) => v === '' || phoneRegex.test(v), 'Número inválido: entre 7 y 15 dígitos (puede iniciar con +)');

const optText = z.string().trim().optional().default('');
const reqText = (msg: string) => z.string().trim().min(1, msg);

export const driverPersonalSchema = z.object({
  first_name: reqText('Indique el primer nombre').max(60),
  middle_name: optText,
  last_name: reqText('Indique el primer apellido').max(60),
  second_last_name: optText,
  id_prefix: z.enum(['V', 'E'], { message: 'Seleccione V o E' }),
  id_number: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9]/g, ''))
    .refine((v) => /^[0-9]{5,10}$/.test(v), 'Cédula inválida: sólo números, entre 5 y 10 dígitos'),
  birth_date: z
    .string()
    .optional()
    .default('')
    .refine((v) => !v || (v > '1900-01-01' && new Date(v) < new Date()), 'Fecha de nacimiento inválida'),
  join_date: reqText('Indique la fecha de ingreso'),
});

export const driverContactSchema = z.object({
  phone: phoneRequired,
  whatsapp: phoneOptional,
  address: reqText('Indique la dirección de habitación').max(300),
  municipality: reqText('Seleccione el municipio'),
  parish: reqText('Indique la parroquia'),
  state: reqText('Indique el estado'),
  emergency_name: optText,
  emergency_relationship: optText,
  emergency_phone: phoneOptional,
  internal_notes: optText,
});

export const driverSchema = driverPersonalSchema.merge(driverContactSchema);
export type DriverFormValues = z.input<typeof driverSchema>;

export const motorcycleSchema = z.object({
  brand: reqText('Indique la marca').max(40),
  model: reqText('Indique el modelo').max(40),
  year: z
    .string()
    .optional()
    .default('')
    .refine((v) => !v || (/^\d{4}$/.test(v) && +v >= 1950 && +v <= new Date().getFullYear() + 1), 'Año inválido'),
  color: optText,
  plate: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .refine((v) => /^[A-Z0-9]{4,10}$/.test(v), 'Placa inválida: entre 4 y 10 letras/números'),
  chassis_serial: optText,
  engine_serial: optText,
  displacement_cc: z
    .string()
    .optional()
    .default('')
    .refine((v) => !v || (/^\d+$/.test(v) && +v >= 25 && +v <= 3000), 'Cilindrada inválida (25 a 3000 cc)'),
  owner_name: reqText('Indique el nombre del propietario').max(120),
  owner_id_doc: optText,
  notes: optText,
});
export type MotorcycleFormValues = z.input<typeof motorcycleSchema>;

/** Convierte '' en null para columnas opcionales antes de enviarlas a la base de datos. */
export function nullify<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: T[K] | null } {
  const out = {} as { [K in keyof T]: T[K] | null };
  for (const k in obj) {
    const v = obj[k];
    out[k] = (typeof v === 'string' && v.trim() === '' ? null : v) as T[typeof k] | null;
  }
  return out;
}

export const MUNICIPIOS_ARAGUA = [
  'Girardot',
  'Mario Briceño Iragorry',
  'Santiago Mariño',
  'Francisco Linares Alcántara',
  'Libertador',
  'Sucre',
  'José Ángel Lamas',
  'Zamora',
  'José Félix Ribas',
  'Santos Michelena',
  'San Sebastián',
  'Tovar',
  'Urdaneta',
  'Bolívar',
  'Camatagua',
  'José Rafael Revenga',
  'Ocumare de la Costa de Oro',
  'San Casimiro',
];
