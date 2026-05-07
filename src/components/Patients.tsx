import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PatientRecord, Medication } from '../types';
import { Plus, User, AlertCircle, Loader2, Download, Search } from 'lucide-react';
import Modal from './Modal';
import { cn, formatDateWithMonthName } from '../lib/utils';
import * as xlsx from 'xlsx';

export default function Patients() {
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Alert modal state
  const [selectedAlertPatient, setSelectedAlertPatient] = useState<{
    name: string;
    originalName: string;
    count: number;
    records: PatientRecord[];
  } | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  // Medication search state
  const [medSearch, setMedSearch] = useState('');
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    nombreCompleto: '',
    origen: '',
    tipoPaciente: 'General',
    medicationId: '',
    cantidad: 1,
    notas: ''
  });

  useEffect(() => {
    const qRecords = query(collection(db, 'patientsRegistry'), orderBy('createdAt', 'desc'));
    let medsLoaded = false;
    let recordsLoaded = false;

    const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PatientRecord[];
      setRecords(recordsData);
      recordsLoaded = true;
      if (medsLoaded && recordsLoaded) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'patientsRegistry');
      setLoading(false);
    });

    const qMeds = query(collection(db, 'medications'), orderBy('nombre'));
    const unsubscribeMeds = onSnapshot(qMeds, (snapshot) => {
      const medsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Medication[];
      setMedications(medsData);
      medsLoaded = true;
      if (medsLoaded && recordsLoaded) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'medications');
    });

    return () => {
      unsubscribeRecords();
      unsubscribeMeds();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const batch = writeBatch(db);
      
      const medicamentName = selectedMed 
        ? `[${selectedMed.clave}] ${selectedMed.nombre} - ${selectedMed.presentacion}`
        : 'Desconocido';

      const newRecordRef = doc(collection(db, 'patientsRegistry'));
      batch.set(newRecordRef, {
        fecha: formData.fecha,
        nombreCompleto: formData.nombreCompleto.trim(),
        origen: formData.origen.trim(),
        tipoPaciente: formData.tipoPaciente,
        medicamento: medicamentName,
        medicationId: selectedMed ? selectedMed.id : null,
        cantidad: Number(formData.cantidad),
        notas: formData.notas.trim() || null,
        createdAt: serverTimestamp()
      });

      if (selectedMed) {
        batch.update(doc(db, 'medications', selectedMed.id), {
          stock_actual: selectedMed.stock_actual - Number(formData.cantidad),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      setIsModalOpen(false);
      setFormData({
        ...formData,
        nombreCompleto: '',
        medicationId: '',
        cantidad: 1,
        notas: ''
      });
      setMedSearch('');
      setSelectedMed(null);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.CREATE, 'patientsRegistry');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const dataToExport = filteredRecords.map(r => ({
      'Fecha': formatDateWithMonthName(r.fecha),
      'Nombre Paciente': r.nombreCompleto,
      'Origen': r.origen,
      'Tipo': r.tipoPaciente,
      'Medicamento': r.medicamento,
      'Cantidad': r.cantidad,
      'Notas': r.notas || ''
    }));
    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Pacientes');
    xlsx.writeFile(workbook, `Registro_Pacientes_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Group by patient to find alerts (> 3 entries)
  const patientRecordsGrouped = records.reduce((acc, curr) => {
    const name = curr.nombreCompleto.toLowerCase();
    if (!acc[name]) acc[name] = [];
    acc[name].push(curr);
    return acc;
  }, {} as Record<string, PatientRecord[]>);

  const patientsWithAlerts = Object.entries(patientRecordsGrouped)
    .filter(([, patientRecords]) => patientRecords.length >= 3)
    .map(([name, patientRecords]) => ({
      name,
      originalName: patientRecords[0].nombreCompleto,
      count: patientRecords.length,
      records: patientRecords
    }));

  // Unique names and origins for datalist autocomplete
  const uniqueNames = Array.from(new Set(records.map(r => r.nombreCompleto)));
  const uniqueOrigins = Array.from(new Set(records.map(r => r.origen).filter(Boolean)));

  const filteredRecords = records.filter(r => 
    r.nombreCompleto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.medicamento.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Registro de Pacientes</h2>
          <p className="text-sm text-gray-500">
            Control de medicamentos dispensados y alertas de pacientes frecuentes.
          </p>
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          <button
            onClick={handleExport}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Registro</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por paciente o medicamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha / Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medicamento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Cargando registros...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p>No se encontraron registros</p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const patientGroup = patientRecordsGrouped[r.nombreCompleto.toLowerCase()];
                  const isRepeated = patientGroup && patientGroup.length >= 3;
                  return (
                    <tr key={r.id} className={cn(isRepeated && "bg-amber-50/50")}>
                      <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100">
                        <div className="font-medium text-gray-900">{formatDateWithMonthName(r.fecha)}</div>
                        <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {r.tipoPaciente}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-bold flex items-center gap-2 capitalize">
                          {r.nombreCompleto}
                          {isRepeated && (
                            <button
                              onClick={() => {
                                const patient = patientsWithAlerts.find(p => p.name === r.nombreCompleto.toLowerCase());
                                if (patient) {
                                  setSelectedAlertPatient(patient);
                                  setIsAlertModalOpen(true);
                                }
                              }}
                              className="text-amber-500 hover:text-amber-700 transition-colors focus:outline-none"
                              title="Ver detalles de dispensación múltiple"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs mt-1">Origen: {r.origen || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium text-gray-900">{r.medicamento}</div>
                        <div className="text-gray-500 text-xs mt-1">Cantidad: <span className="font-bold">{r.cantidad}</span></div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {r.notas || '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="Alerta de Dispensación Múltiple"
      >
        {selectedAlertPatient && (
          <div className="space-y-4">
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-amber-800">
                  El paciente <span className="font-bold capitalize">{selectedAlertPatient.originalName}</span> ha recibido medicamentos <span className="font-bold">{selectedAlertPatient.count} veces</span>, superando el límite sugerido.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-medium text-gray-700 text-sm">
                Historial de Medicamentos Entregados
              </div>
              <div className="max-h-[300px] overflow-y-auto p-4 space-y-4">
                {selectedAlertPatient.records.map((r, i) => (
                  <div key={r.id || i} className="border-l-2 border-blue-500 pl-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{formatDateWithMonthName(r.fecha)}</div>
                        <div className="text-xs text-blue-600 font-medium">{r.tipoPaciente}</div>
                      </div>
                      <div className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded font-medium">
                        {r.origen || 'Sin origen'}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-700 truncate" title={r.medicamento}>
                      {r.medicamento} <span className="font-semibold text-blue-600 ml-1">x{r.cantidad}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setIsAlertModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nuevo Registro de Paciente"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha
              </label>
              <input
                type="date"
                required
                value={formData.fecha}
                onChange={e => setFormData({...formData, fecha: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Paciente
              </label>
              <select
                required
                value={formData.tipoPaciente}
                onChange={e => setFormData({...formData, tipoPaciente: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="General">General</option>
                <option value="Sin Expediente">Sin Expediente</option>
                <option value="Hipertenso">Hipertenso</option>
                <option value="Crónico">Crónico</option>
                <option value="Embarazada">Embarazada</option>
                <option value="Menor de Edad">Menor de Edad</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre Completo
            </label>
            <input
              type="text"
              required
              list="patient-names"
              value={formData.nombreCompleto}
              onChange={e => setFormData({...formData, nombreCompleto: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Ej. Juan Pérez García"
            />
            <datalist id="patient-names">
              {uniqueNames.map((name, i) => <option key={i} value={name} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              De dónde viene (Origen/Domicilio)
            </label>
            <input
              type="text"
              required
              list="patient-origins"
              value={formData.origen}
              onChange={e => setFormData({...formData, origen: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Ej. Colonia Centro"
            />
            <datalist id="patient-origins">
              {uniqueOrigins.map((orig, i) => <option key={i} value={orig} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-3">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Medicamento(s)
                </label>
                <input
                  type="text"
                  required={!selectedMed}
                  value={medSearch}
                  onChange={e => {
                    setMedSearch(e.target.value);
                    if (selectedMed) setSelectedMed(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Buscar medicamento por nombre o clave..."
                />
                
                {medSearch && !selectedMed && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {medications.filter(m => 
                      m.nombre.toLowerCase().includes(medSearch.toLowerCase()) || 
                      m.clave.toLowerCase().includes(medSearch.toLowerCase()) ||
                      (m.descripcion && m.descripcion.toLowerCase().includes(medSearch.toLowerCase()))
                    ).slice(0, 10).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMed(m);
                          setMedSearch(`[${m.clave}] ${m.nombre}`);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 focus:bg-gray-50 outline-none border-b border-gray-100 last:border-0"
                      >
                        <div className="font-medium text-gray-900">[{m.clave}] {m.nombre}</div>
                        <div className="text-xs text-gray-500">
                          Stock: {m.stock_actual} | {m.presentacion || 'Sin presentación'}
                        </div>
                      </button>
                    ))}
                    {medications.filter(m => 
                      m.nombre.toLowerCase().includes(medSearch.toLowerCase()) || 
                      m.clave.toLowerCase().includes(medSearch.toLowerCase()) ||
                      (m.descripcion && m.descripcion.toLowerCase().includes(medSearch.toLowerCase()))
                    ).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        No se encontraron medicamentos
                      </div>
                    )}
                  </div>
                )}
                {selectedMed && (
                  <div className="mt-2 text-sm text-blue-600 flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-100">
                    <span>Stock disponible: <strong>{selectedMed.stock_actual}</strong></span>
                    {selectedMed.stock_actual <= 0 && (
                      <span className="text-red-500 font-bold">¡Sin stock!</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.cantidad}
                onChange={e => setFormData({...formData, cantidad: Number(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas Adicionales (Opcional)
            </label>
            <textarea
              value={formData.notas}
              onChange={e => setFormData({...formData, notas: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
              placeholder="Algún comentario sobre la entrega o el paciente..."
            ></textarea>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors border border-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Guardar Registro
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
