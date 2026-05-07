import { Timestamp } from 'firebase/firestore';

export interface Medication {
  id: string; // The Firestore document ID
  num: number;
  clave: string;
  nombre: string;
  descripcion: string;
  presentacion: string;
  stock_actual: number;
  existencia_mes_pasado?: number;
  fecha_existencia_mes_pasado?: string | null;
  surtido?: number;
  fecha_surtido?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LogEntry {
  id: string;
  folio: string;
  fechaIngreso: string;
  fechaEgreso: string;
  denominacionDistinta?: string;
  denominacionGenerica?: string;
  presentacion?: string;
  cantidad: number;
  nombreMedico?: string;
  cedulaProfesional?: string;
  domicilio?: string;
  paciente?: string;
  medicationId: string;
  createdAt: Timestamp;
}

export interface PatientRecord {
  id: string;
  fecha: string;
  nombreCompleto: string;
  origen: string;
  tipoPaciente: string;
  medicamento: string;
  medicationId?: string;
  cantidad: number;
  notas?: string;
  createdAt: Timestamp;
}
