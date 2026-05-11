import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PatientRecord, Medication } from '../types';
import { Plus, User, AlertCircle, Loader2, Download, Search, Edit } from 'lucide-react';
import Modal from './Modal';
import { cn, formatDateWithMonthName } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Patients() {
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
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
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    nombreCompleto: '',
    expediente: '',
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
        : editingId ? (records.find(r => r.id === editingId)?.medicamento || 'Desconocido') : 'Desconocido';

      if (editingId) {
        const oldRecord = records.find(r => r.id === editingId);
        if (oldRecord) {
          // Update record
          const recordRef = doc(db, 'patientsRegistry', editingId);
          batch.update(recordRef, {
            fecha: formData.fecha,
            nombreCompleto: formData.nombreCompleto.trim(),
            expediente: formData.expediente.trim(),
            origen: formData.origen.trim(),
            tipoPaciente: formData.tipoPaciente,
            medicamento: selectedMed ? medicamentName : oldRecord.medicamento,
            medicationId: selectedMed ? selectedMed.id : oldRecord.medicationId,
            cantidad: Number(formData.cantidad),
            notas: formData.notas.trim() || null,
          });

          // Atomic Stock Management:
          // Scenario A: Same medication, different quantity -> Update with diff
          // Scenario B: Different medication -> Revert old, subtract from new
          
          const currentMedId = selectedMed ? selectedMed.id : oldRecord.medicationId;
          
          if (currentMedId === oldRecord.medicationId) {
            // Case A: same medication
            if (currentMedId) {
              const diff = oldRecord.cantidad - Number(formData.cantidad);
              if (diff !== 0) {
                batch.update(doc(db, 'medications', currentMedId), {
                  stock_actual: increment(diff),
                  updatedAt: serverTimestamp()
                });
              }
            }
          } else {
            // Case B: different medications
            // Revert old one
            if (oldRecord.medicationId) {
              batch.update(doc(db, 'medications', oldRecord.medicationId), {
                stock_actual: increment(oldRecord.cantidad),
                updatedAt: serverTimestamp()
              });
            }
            // Subtract from new one
            if (currentMedId) {
              batch.update(doc(db, 'medications', currentMedId), {
                stock_actual: increment(-Number(formData.cantidad)),
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      } else {
        const newRecordRef = doc(collection(db, 'patientsRegistry'));
        batch.set(newRecordRef, {
          fecha: formData.fecha,
          nombreCompleto: formData.nombreCompleto.trim(),
          expediente: formData.expediente.trim(),
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
            stock_actual: increment(-Number(formData.cantidad)),
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      
      // Cleanup on success
      setIsModalOpen(false);
      setEditingId(null);
      setMedSearch('');
      setSelectedMed(null);
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        nombreCompleto: '',
        expediente: '',
        origen: '',
        tipoPaciente: 'General',
        medicationId: '',
        cantidad: 1,
        notas: ''
      });
    } catch (error) {
      console.error('Error saving patient record:', error);
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'patientsRegistry');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = (monthYear?: string | React.MouseEvent) => {
    const monthYearStr = typeof monthYear === 'string' ? monthYear : undefined;

    let exportRecords: PatientRecord[] = [];

    if (monthYearStr) {
      exportRecords = groupedRecords[monthYearStr] || [];
    } else {
      exportRecords = filteredRecords;
    }

    if (exportRecords.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title and Header
    doc.setFontSize(18);
    doc.text('Registro de Pacientes - Botica CESSA Pinos', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(11);
    const generationDateStr = formatDateWithMonthName(new Date().toISOString().split('T')[0]);
    const dateRange = monthYearStr ? `Reporte de ${monthYearStr} (Generado el ${generationDateStr})` : `Reporte General (${generationDateStr})`;
    doc.text(dateRange, pageWidth / 2, 22, { align: 'center' });

    const tableData = exportRecords.map(r => [
      formatDateWithMonthName(r.fecha),
      r.tipoPaciente,
      r.expediente || 'S/N',
      r.nombreCompleto,
      r.origen || '-',
      r.medicamento,
      r.cantidad.toString(),
      r.notas || '-'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Tipo', 'Exp.', 'Paciente', 'Origen', 'Medicamento', 'Cant.', 'Notas']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 }, // Fecha
        1: { cellWidth: 20 }, // Tipo
        2: { cellWidth: 15 }, // Exp
        3: { cellWidth: 35 }, // Paciente
        4: { cellWidth: 25 }, // Origen
        5: { cellWidth: 35 }, // Medicamento
        6: { cellWidth: 10 }, // Cant
        7: { cellWidth: 'auto' } // Notas
      },
      margin: { top: 30 },
      didDrawPage: () => {
        // Footer with page number
        const str = `Página ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.text(str, pageWidth - 20, doc.internal.pageSize.getHeight() - 10);
      }
    });

    const fileName = monthYearStr 
      ? `Registro_Pacientes_${monthYearStr.replace(' ', '_')}.pdf`
      : `Registro_Pacientes_Completo_${new Date().toISOString().split('T')[0]}.pdf`;

    doc.save(fileName);
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

  // All available months in the data
  const availableMonths = Array.from(new Set(records.map(r => {
    const date = new Date(r.fecha);
    return date.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  }))).sort((a, b) => {
    const [monthA, yearA] = a.toLowerCase().split(' ');
    const [monthB, yearB] = b.toLowerCase().split(' ');
    const meses: Record<string, number> = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
      'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    const dateA = new Date(parseInt(yearA), meses[monthA] ?? 0, 1);
    const dateB = new Date(parseInt(yearB), meses[monthB] ?? 0, 1);
    return dateB.getTime() - dateA.getTime();
  });

  const filteredRecords = records.filter(r => {
    const matchesSearch = (r.nombreCompleto || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (r.medicamento || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedMonthFilter === 'all') return matchesSearch;
    
    const dateValue = r.fecha ? new Date(r.fecha) : new Date();
    const recordMonth = dateValue.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    return matchesSearch && recordMonth === selectedMonthFilter;
  });

  // Group records by month for the UI
  const groupedRecords = filteredRecords.reduce((acc, curr) => {
    const date = new Date(curr.fecha);
    const monthYear = date.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(curr);
    return acc;
  }, {} as Record<string, PatientRecord[]>);

  const monthOrder = Object.keys(groupedRecords).sort((a, b) => {
    const [monthA, yearA] = a.toLowerCase().split(' ');
    const [monthB, yearB] = b.toLowerCase().split(' ');
    const meses: Record<string, number> = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
      'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    const dateA = new Date(parseInt(yearA), meses[monthA] ?? 0, 1);
    const dateB = new Date(parseInt(yearB), meses[monthB] ?? 0, 1);
    return dateB.getTime() - dateA.getTime(); // Newest months first
  });

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
            onClick={() => handleExport(selectedMonthFilter !== 'all' ? selectedMonthFilter : undefined)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="w-4 h-4 text-red-600" />
            PDF
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
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por paciente o medicamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none"
            >
              <option value="all">Todos los meses</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-6 py-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Cargando registros...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p>No se encontraron registros</p>
            </div>
          ) : (
            <div className="space-y-4">
              {monthOrder.map((month) => (
                <div key={month} className="border-b border-gray-100 last:border-0">
                  <div className="bg-gray-50 px-6 py-3 flex justify-between items-center sticky top-0 z-10 border-y border-gray-200">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                      {month}
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32 font-bold">Fecha / Tipo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">Expediente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">Paciente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">Medicamento</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">Notas</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedRecords[month].map((r) => {
                        const patientGroup = patientRecordsGrouped[r.nombreCompleto.toLowerCase()];
                        const isRepeated = patientGroup && patientGroup.length >= 3;
                        return (
                          <tr key={r.id} className={cn(isRepeated && "bg-amber-50/50 hover:bg-amber-100/50 transition-colors", !isRepeated && "hover:bg-gray-50 transition-colors")}>
                            <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100">
                              <div className="font-medium text-gray-900">
                                {new Date(r.fecha).toLocaleDateString('es-MX', { day: 'numeric', weekday: 'short' })}
                              </div>
                              <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                {r.tipoPaciente}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 font-mono font-bold text-blue-600">
                              {r.expediente || 'S/N'}
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
                              <div className="font-medium text-gray-900 leading-tight">{r.medicamento}</div>
                              <div className="text-gray-500 text-xs mt-1">Cantidad: <span className="font-bold text-blue-600">{r.cantidad}</span></div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate italic">
                              {r.notas || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setEditingId(r.id);
                                  setFormData({
                                    fecha: r.fecha,
                                    nombreCompleto: r.nombreCompleto,
                                    expediente: r.expediente || '',
                                    origen: r.origen || '',
                                    tipoPaciente: r.tipoPaciente,
                                    medicationId: r.medicationId || '',
                                    cantidad: r.cantidad,
                                    notas: r.notas || ''
                                  });
                                  const med = medications.find(m => m.id === r.medicationId);
                                  if (med) {
                                    setSelectedMed(med);
                                    setMedSearch(med.nombre);
                                  } else {
                                    setSelectedMed(null);
                                    setMedSearch('');
                                  }
                                  setIsModalOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-900 transition-colors bg-blue-50 p-2 rounded-lg"
                                title="Editar registro"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                No. Expediente
              </label>
              <input
                type="text"
                required
                value={formData.expediente}
                onChange={e => setFormData({...formData, expediente: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Introducir número..."
              />
            </div>
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
              onClick={() => {
                setIsModalOpen(false);
                setEditingId(null);
                setFormData({
                  fecha: new Date().toISOString().split('T')[0],
                  nombreCompleto: '',
                  expediente: '',
                  origen: '',
                  tipoPaciente: 'General',
                  medicationId: '',
                  cantidad: 1,
                  notas: ''
                });
                setMedSearch('');
                setSelectedMed(null);
              }}
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
              {editingId ? 'Actualizar Registro' : 'Guardar Registro'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
