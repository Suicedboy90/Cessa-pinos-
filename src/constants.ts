export const PATIENT_TYPES = [
  'General',
  'Sin Expediente',
  'Hipertenso',
  'Crónico',
  'Embarazada',
  'Menor de Edad',
  'Otro'
] as const;

export type PatientType = typeof PATIENT_TYPES[number];
