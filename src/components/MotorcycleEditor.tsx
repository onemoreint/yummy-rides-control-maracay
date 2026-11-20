import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { uploadPrivate } from '../lib/files';
import { friendlyError, supabase } from '../lib/supabase';
import type { Motorcycle } from '../lib/types';
import { motorcycleSchema, nullify, type MotorcycleFormValues } from '../lib/validation';
import { PhotoInput } from './media';
import { Button, ErrorBox, Field, Input, Textarea } from './ui';

function toForm(m?: Motorcycle | null): MotorcycleFormValues {
  return {
    brand: m?.brand ?? '',
    model: m?.model ?? '',
    year: m?.year ? String(m.year) : '',
    color: m?.color ?? '',
    plate: m?.plate ?? '',
    chassis_serial: m?.chassis_serial ?? '',
    engine_serial: m?.engine_serial ?? '',
    displacement_cc: m?.displacement_cc ? String(m.displacement_cc) : '',
    owner_name: m?.owner_name ?? '',
    owner_id_doc: m?.owner_id_doc ?? '',
    notes: m?.notes ?? '',
  };
}

/**
 * Formulario de motocicleta (crear o editar) con tres fotografías.
 * El conductor NO se asume propietario: el propietario es un campo propio.
 */
export default function MotorcycleEditor({
  initial,
  ownerSuggestion,
  onSaved,
  submitLabel = 'Guardar motocicleta',
}: {
  initial?: Motorcycle | null;
  ownerSuggestion?: { name: string; doc: string };
  onSaved: (m: Motorcycle) => void | Promise<void>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MotorcycleFormValues>({
    resolver: zodResolver(motorcycleSchema) as unknown as Resolver<MotorcycleFormValues>,
    defaultValues: toForm(initial),
  });
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(raw: MotorcycleFormValues) {
    setError(null);
    const v = motorcycleSchema.parse(raw);
    const payload = {
      ...nullify({ ...v, year: '', displacement_cc: '' }),
      year: v.year ? Number(v.year) : null,
      displacement_cc: v.displacement_cc ? Number(v.displacement_cc) : null,
      brand: v.brand,
      model: v.model,
      plate: v.plate,
      owner_name: v.owner_name,
    };
    try {
      let moto: Motorcycle;
      if (initial) {
        const { data, error } = await supabase.from('motorcycles').update(payload).eq('id', initial.id).select().single();
        if (error) throw error;
        moto = data as Motorcycle;
      } else {
        const { data, error } = await supabase.from('motorcycles').insert(payload).select().single();
        if (error) throw error;
        moto = data as Motorcycle;
      }
      const photoPatch: Partial<Motorcycle> = {};
      const folder = `motorcycles/${moto.id}/photos`;
      if (front) photoPatch.photo_front_path = await uploadPrivate(folder, front);
      if (side) photoPatch.photo_side_path = await uploadPrivate(folder, side);
      if (platePhoto) photoPatch.photo_plate_path = await uploadPrivate(folder, platePhoto);
      if (Object.keys(photoPatch).length) {
        const { data, error } = await supabase.from('motorcycles').update(photoPatch).eq('id', moto.id).select().single();
        if (error) throw error;
        moto = data as Motorcycle;
      }
      await onSaved(moto);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      {error && <ErrorBox message={error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marca" required error={errors.brand?.message}>
          <Input {...register('brand')} invalid={!!errors.brand} placeholder="Bera, Empire, Suzuki…" />
        </Field>
        <Field label="Modelo" required error={errors.model?.message}>
          <Input {...register('model')} invalid={!!errors.model} />
        </Field>
        <Field label="Número de placa" required error={errors.plate?.message} hint="Se guarda sin espacios ni guiones">
          <Input {...register('plate')} invalid={!!errors.plate} className="uppercase" placeholder="AB1C23D" />
        </Field>
        <Field label="Año" error={errors.year?.message}>
          <Input {...register('year')} inputMode="numeric" invalid={!!errors.year} />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <Input {...register('color')} />
        </Field>
        <Field label="Cilindrada (cc)" error={errors.displacement_cc?.message}>
          <Input {...register('displacement_cc')} inputMode="numeric" invalid={!!errors.displacement_cc} placeholder="Opcional" />
        </Field>
        <Field label="Serial de chasis" error={errors.chassis_serial?.message}>
          <Input {...register('chassis_serial')} className="uppercase" />
        </Field>
        <Field label="Serial de motor" error={errors.engine_serial?.message}>
          <Input {...register('engine_serial')} className="uppercase" />
        </Field>
        <Field label="Nombre del propietario" required error={errors.owner_name?.message}>
          <Input {...register('owner_name')} invalid={!!errors.owner_name} />
        </Field>
        <Field label="Cédula / RIF del propietario" hint="Si corresponde">
          <Input {...register('owner_id_doc')} />
        </Field>
      </div>
      {ownerSuggestion && !initial && (
        <button
          type="button"
          className="text-xs text-yummy-300 underline"
          onClick={() => {
            setValue('owner_name', ownerSuggestion.name);
            setValue('owner_id_doc', ownerSuggestion.doc);
          }}
        >
          El conductor es el propietario (rellenar sus datos)
        </button>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <PhotoInput label="Foto frontal" file={front} existingPath={initial?.photo_front_path} onChange={setFront} />
        <PhotoInput label="Foto lateral" file={side} existingPath={initial?.photo_side_path} onChange={setSide} />
        <PhotoInput label="Foto de la placa" file={platePhoto} existingPath={initial?.photo_plate_path} onChange={setPlatePhoto} />
      </div>
      <Field label="Observaciones">
        <Textarea {...register('notes')} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" icon={Save} loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
